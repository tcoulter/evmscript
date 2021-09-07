import { ActionFunction, ContextFunction, ExpressionFunction } from "./actions";
import { Action, ActionPointer, Expression, Hexable, Instruction, IntermediateRepresentation, RelativeStackReference, sanitizeHexStrings, StackReference } from "./grammar";
import { ActionIdToCodeLocation, ExecutedCodeContext, RuntimeContext } from "./index";

export type UserFacingFunction = (...args: Expression[]) => Expression|ActionPointer;

export type InstructionIndexToActionIndex = Array<number>;
export type ActionIdToInstructionIndex = Record<number, number>;

export type StackHistory = Array<StackReference[]>;

export const POINTER_BYTE_LENGTH = 2;

export function byteLength(input:IntermediateRepresentation):number {
  if (input instanceof Hexable) {
    return input.byteLength();
  }

  if (typeof input == "number") {
    input = BigInt(input);
    // Don't return; let next block take care of it.
  }

  if (typeof input == "bigint") { 
    let length = input.toString(16).length;
    return Math.floor(length / 2) + (length % 2);
  }

  throw new Error("Unknown input to byteLength(): " + input);
}

export function createActionHandler(runtimeContext:RuntimeContext, key:string, fn:ActionFunction):UserFacingFunction {
  let handler:UserFacingFunction = function(...args:Expression[]) {

    args = args.map((input:Expression) => sanitizeHexStrings(input, key));
    let action:Action = fn(...args); 

    runtimeContext.pushAction(action);
    
    return action.getPointer();
  }

  return handler;
}

export function createExpressionHandler(key:string, fn:ExpressionFunction):UserFacingFunction {
  // Note that Expression has the largest surface area of available types,
  // so it applies to all function types.
  let handler:UserFacingFunction = function(...args:Expression[]) {
    args = args.map((input:Expression) => sanitizeHexStrings(input, key));
    return fn.apply(null, [...args]);
  }

  return handler;
}


export function createContextHandler(runtimeContext:RuntimeContext, key:string, fn:ContextFunction):UserFacingFunction {
  // Note that Expression has the largest surface area of available types,
  // so it applies to all function types.
  let handler:UserFacingFunction = function(...args:Expression[]) {
    args = args.map((input:Expression) => sanitizeHexStrings(input, key));
    return fn.apply(null, [runtimeContext, ...args]);
  }

  return handler;
}

export function convertActionsToIntermediateRepresentation(actions:Action[]):{
  intermediate:IntermediateRepresentation[]; 
  headActionIndexes:InstructionIndexToActionIndex,
  actionInstructionStart:ActionIdToInstructionIndex
} {
  
  // Since actions can themselves contain actions, lets flatten array into 
  // a single intermediate representation representing the whole program.
  let intermediate:IntermediateRepresentation[] = []
  let headActionIndexes:InstructionIndexToActionIndex = [];
  let headIndex:number = undefined; 
  let actionInstructionStart:ActionIdToInstructionIndex = {};
  let processAction = (action:Action) => {
    // Save the index of intermediate where the action starts
    actionInstructionStart[action.id] = intermediate.length;
    
    // If it's a jump destintation, insert one. Note that
    // this instruction gets attributed to the head index.
    if (action.isJumpDestination) {
      headActionIndexes[intermediate.length] = headIndex; 
      intermediate.push(Instruction.JUMPDEST);
    }

    // Process all instructions of the action, attributing
    // the instructions to the head action. 
    action.intermediate.forEach((item) => {
      if (item instanceof Action) {
        processAction(item);
      } else {
        headActionIndexes[intermediate.length] = headIndex; 
        intermediate.push(item);
      }
    })
  }

  actions.forEach((action:Action, actionIndex:number) => {
    headIndex = actionIndex;
    processAction(action);
  })

  return {
    intermediate, 
    headActionIndexes,
    actionInstructionStart
  }
}

export function processStack(intermediate:IntermediateRepresentation[], actions:Action[], actionIndexesFromInstructionIndexes:InstructionIndexToActionIndex):{
  dereferencedIntermediate: IntermediateRepresentation[],
  stackHistory: StackHistory
} {
  let currentActionIndex:number = 0;
  let stack:StackReference[] = [];
  let stackHistory:StackHistory = [];
  let addionionalDupsThisAction = 0; 

  let dereferencedIntermediate = 
    intermediate.map((item:IntermediateRepresentation, itemIndex:number) => {
      currentActionIndex = actionIndexesFromInstructionIndexes[itemIndex];

      // Convert stack references to DUPs, and then process the dup as a 
      // normal instruction.
      if (item instanceof RelativeStackReference) {
        if (currentActionIndex == 0) {
          throw new Error("FATAL ERROR: unexpected stack reference pointing to first processable action.");
        }

        // Return a real reference, that's kept the same across actions
        // so long as that stack position isn't consumed. 
        let realReference = stackHistory[actions.indexOf(item.action)][item.index];

        // Look for the reference in the output stack from the last action,
        // as that represents the stack state at the beginning of this action.
        let currentDepth = stackHistory[currentActionIndex - 1].indexOf(realReference);

        if (currentDepth < 0) {
          throw new Error("Stack slot referenced in a call to function " + item.action.name + "() won't exist on the stack during runtime. Check instructions and ensure the slot hasn't been previously consumed.")
        }

        // We add one because DUP1 is the top (index 0)
        let dupNumber = (currentDepth + 1) + addionionalDupsThisAction;

        // We don't return the DUP. Instead, we set item to be the DUP
        // so it'll get processed like normal in the block below.
        item = Instruction["DUP" + dupNumber];
        addionionalDupsThisAction += 1;
      } 

      if (item instanceof Instruction) {
        let instruction = item;
        let [removed, added] = instruction.stackDelta();

        // Use Array here to do something N times as a one-liner
        [...Array(removed)].forEach(() => stack.shift());
        [...Array(added)].forEach(() => stack.unshift(new StackReference()));
      
        // If this is a swap, process the swap on the stack
        if (instruction.code >= 0x90 && instruction.code <= 0x9F) {
          let swapIndex = instruction.code - 0x8F; // e.g., if SWAP1/0x90, will return reference at index 1
          
          if (swapIndex >= stack.length) {
            throw new Error("Cannot execute SWAP" + swapIndex + ": swap index out of range");
          }

          let top = stack[0];
          let toSwap = stack[swapIndex]; 

          stack[0] = toSwap;
          stack[swapIndex] = top; 
        }
      }

      // If this is the last instruction of the action, save a shallow copy to stack history.
      if (itemIndex + 1 >= intermediate.length || actionIndexesFromInstructionIndexes[itemIndex + 1] != currentActionIndex) {
        stackHistory[currentActionIndex] = [...stack];
        addionionalDupsThisAction = 0; 
      }
      
      return item;
    })
  
  return {
    dereferencedIntermediate,
    stackHistory
  }
}

export function translateToBytecode(item:IntermediateRepresentation, executedCodeContext:ExecutedCodeContext, codeLocations:ActionIdToCodeLocation):string {
  let bytecode = "";

  if (item instanceof Hexable) {
    bytecode = item.toHex(executedCodeContext, codeLocations);
  } else {
    bytecode = item.toString(16);
  }

  return ensureFullByte(bytecode).toUpperCase();
}

export function leftPad(bytecode:string, byteLength:number) {
  while (bytecode.length % (byteLength * 2) != 0) {
    bytecode = "0" + bytecode;
  }

  return bytecode;
}

export function rightPad(bytecode:string, byteLength:number) {
  while (bytecode.length % (byteLength * 2) != 0) {
    bytecode = bytecode + "0";
  }

  return bytecode;
}

export function ensureFullByte(bytecode:string) {
  return leftPad(bytecode, 1);
}