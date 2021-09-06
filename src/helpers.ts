import { ActionFunction, ContextFunction, ExpressionFunction } from "./actions";
import { Action, ActionParameter, ActionPointer, Expression, Hexable, HexableValue, Instruction, IntermediateRepresentation, RelativeStackReference, sanitizeHexStrings, StackReference } from "./grammar";
import { ActionIndexToCodeLocation, ExecutedCodeContext, RuntimeContext } from "./index";

export type UserFacingFunction = (...args: Expression[]) => Expression|ActionPointer;

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
    let mainAction = new Action(false, "key");
    let mainActionPointer = mainAction.getPointer();

    args = args.map((input:Expression) => sanitizeHexStrings(input, key));
    let otherActions:Action[] = fn.apply(null, [runtimeContext, mainAction.intermediate, ...args]) || []; 

    runtimeContext.pushAction(mainAction);
    otherActions.forEach((action) => {
      runtimeContext.pushAction(action);
    });
  
    return mainActionPointer;
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

export function processStack(stack:StackReference[], intermediate:IntermediateRepresentation[]):StackReference[] {
  let newStack = [...stack];

  intermediate
    .filter((item) => item instanceof Instruction)
    .forEach((instruction:Instruction) => {
      let [removed, added] = instruction.stackDelta();

      // Use Array here to do something N times as a one-liner
      [...Array(removed)].forEach(() => newStack.shift());
      [...Array(added)].forEach(() => newStack.unshift(new StackReference()));
    
      // If this is a swap, process the swap on the stack
      if (instruction.code >= 0x90 && instruction.code <= 0x9F) {
        let swapIndex = instruction.code - 0x8F; // e.g., if SWAP1/0x90, will return reference at index 1
        
        if (swapIndex >= newStack.length) {
          throw new Error("Cannot execute SWAP" + swapIndex + ": swap index out of range");
        }

        let top = newStack[0];
        let toSwap = newStack[swapIndex]; 

        newStack[0] = toSwap;
        newStack[swapIndex] = top; 
      }
    })
  
  return newStack;
}

export function translateToBytecode(item:IntermediateRepresentation, executedCodeContext:ExecutedCodeContext, codeLocations:ActionIndexToCodeLocation):string {
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