import vm from 'vm';
import fs from "fs";
import path from "path";
import os from "os";
import { actionFunctions, expressionFunctions, contextFunctions } from "./actions";
import { ActionPointer, Action, IntermediateRepresentation, Instruction, StackReference, RelativeStackReference, PrunedError, HotSwapStackReference } from "./grammar";
import { byteLength, createActionHandler, createContextHandler, createExpressionHandler, translateToBytecode, UserFacingFunction } from './helpers';

export class RuntimeContext {
  deployable: boolean = false;
  actions: Action[] = [];

  pushAction(action:Action) {
    this.actions.push(action);
  }
}

export type CodeContext = Record<string, UserFacingFunction|Console>;
export type ExecutedCodeContext = Record<string, any>;

export type ActionIdToCodeLocation = Record<number, BigInt>;

export function preprocess(code:string, extraContext:Record<string, any> = {}, filename:string = "bytecode"):string {

  let runtimeContext:RuntimeContext = new RuntimeContext();

  // Set some custom context functions, taking in what's passed by the user
  let codeContext:CodeContext = {
    ...extraContext,
    console
  }

  // Create a prefix for internal functions so there's no collision.
  // As you can tell, we're not messing around. We declare action functions, etc.,
  // as internal functions within the codeContext, so that we can declare
  // const versions of those functions *within* the code, preventing the user
  // from redefining "built in" functions.
  const internalFunctionPrefix = "__internal__$$__" + new Date().getTime();

  Object.keys(actionFunctions)
    .filter((key) => typeof actionFunctions[key] == "function")
    .map<[string, UserFacingFunction]>((key) => [key, createActionHandler(runtimeContext, key, actionFunctions[key])])
    .forEach(([key, fn]) => codeContext[internalFunctionPrefix + key] = fn)

  Object.keys(expressionFunctions)
    .filter((key) => typeof expressionFunctions[key] == "function")
    .map<[string, UserFacingFunction]>((key) => [key, createExpressionHandler(key, expressionFunctions[key])])
    .forEach(([key, fn]) => codeContext[internalFunctionPrefix + key] = fn)

  Object.keys(contextFunctions)
    .filter((key) => typeof contextFunctions[key] == "function")
    .map<[string, UserFacingFunction]>((key) => [key, createContextHandler(runtimeContext, key, contextFunctions[key])])
    .forEach(([key, fn]) => codeContext[internalFunctionPrefix + key] = fn)


  // Translate all internalFunctionPrefix'd keys to having the prefix removed, by adding
  // a preamble to the code. This ensures the user will receive an error if they
  // accidentally define a function of the same name. 
  let preamble = "";

  Object.keys(codeContext).forEach((key) => {
    if (key.indexOf(internalFunctionPrefix) >= 0) {
      let nonPrefixedKey = key.replace(internalFunctionPrefix, "");
      preamble = preamble + `const ${nonPrefixedKey} = this.${key};` + os.EOL;
    }
  })

  code = preamble + code;

  // Run a first pass, which evaluates the input and turns it into
  // an intermediate representation.
  try {
    // When running runInNewContext, we set the filename if one was passed
    // in, and we start line numbering so that it ignores the preamble.
    // Note that the [evmscript] suffix is important to code processing.
    // See how PrunedError is used.
    vm.runInNewContext(code, codeContext, {
      filename: filename + " [evmscript]",
      lineOffset: (-preamble.split(/\r?\n/).length) + 1
    });
  } catch (e) {
    throw PrunedError.from(e);
  } 

  // Note: After execution, node can set values of any type to the context,
  // so we can't rely on types here. Let's make that explicit.
  let executedCodeContext:ExecutedCodeContext = codeContext;

  // Explore the codeContext for any variables of type ActionPointer.
  // If they exist, it means a (potentially) jumpable label was used in the code.
  // If the name doesn't start with an _, then we'll assume it's a jump
  // destination, and we'll mark it as such. 
  Object.keys(executedCodeContext)
    .filter((key) => executedCodeContext[key] instanceof ActionPointer)
    .filter((key) => key.indexOf("_") != 0)
    .map<ActionPointer>((key) => executedCodeContext[key])
    .forEach((actionPointer) => actionPointer.action.setIsJumpDestination())

  // Next, concatenate the intermediate representation and tail data
  let processor = new ActionProcessor(runtimeContext.actions, executedCodeContext);
  let output = processor.processAll();

  // If the code is set to deployable, use our own preprocessor to create
  // a deployer for that code.
  if (runtimeContext.deployable == true) {
    output = preprocessFile(path.join(__dirname, "./deployer.bytecode"), {
      CODE: output
    })
  }

  return output;
}

export function preprocessFile(inputFile:string, extraContext:Record<string, any> = {}) {
  let input:string = fs.readFileSync(inputFile, "utf-8");
  return preprocess(input, extraContext, inputFile);
}

export type InstructionIndexToActionIndex = Array<number>;
export type ActionIdToInstructionIndex = Record<number, number>;
export type StackHistory = Array<StackReference[]>;

export class ActionProcessor {
  actions:Action[];
  executedCodeContext:ExecutedCodeContext;
  intermediate:IntermediateRepresentation[] = [];
  parentActionIndexes:InstructionIndexToActionIndex = [];
  actionInstructionStartIndex:ActionIdToInstructionIndex = {};
  stackHistory:StackHistory = [];
  bytesPerInstruction:Array<number>;
  totalBytesAtInstruction:Array<number>;
  jumpDestinations:ActionIdToCodeLocation = {}

  constructor(actions:Action[], executedCodeContext:ExecutedCodeContext) {
    // Push any tail actions to the end.
    this.actions = [...actions];
    
    this.actions.forEach((action) => {
      this.actions.push(...action.tail)
    })

    // Prune actions that are a child of another action
    this.actions = this.actions.filter((action) => typeof action.parentAction == "undefined");

    this.executedCodeContext = executedCodeContext;
  }

  processAll() {
    this.processActions();
    this.processStack();
    this.processByteLengths();
    this.processJumpDestinations();
    return this.toHex();
  }

  processActions() {
    // Since actions can themselves contain actions, lets flatten array into 
    // a single intermediate representation representing the whole program. 
    let processAction = (action:Action, parentIndex:number) => {
      // Save the index of intermediate where the action starts
      this.actionInstructionStartIndex[action.id] = this.intermediate.length;
      
      // If it's a jump destintation, insert one. Note that
      // this instruction gets attributed to the head index.
      if (action.isJumpDestination) {
        this.parentActionIndexes[this.intermediate.length] = parentIndex; 
        this.intermediate.push(Instruction.JUMPDEST);
      }

      // Process all instructions of the action, attributing
      // the instructions to the head action. 
      action.intermediate.forEach((item) => {
        if (item instanceof Action) {
          processAction(item, parentIndex);
        } else {
          this.parentActionIndexes[this.intermediate.length] = parentIndex; 
          this.intermediate.push(item);
        }
      })
    }

    this.actions.forEach(processAction);
  }

  processStack() {
    let stack:StackReference[] = [];
  
    this.intermediate = this.intermediate.map((item:IntermediateRepresentation, itemIndex:number) => {
      // Make a copy so we can see what was passed in during the second block, 
      // as it may be manipulated by the first block. 
      let original = item; 

      let currentActionIndex = this.parentActionIndexes[itemIndex];
      let currentAction = this.actions[currentActionIndex];

      // Convert stack references to DUPs, and then process the dup as a 
      // normal instruction.
      if (item instanceof RelativeStackReference) {
        if (currentActionIndex == 0) {
          throw new Error("FATAL ERROR: unexpected stack reference pointing to first processable action.");
        }

        // Return a real reference, that's kept the same across actions
        // so long as that stack position isn't consumed. 
        let realReference = this.stackHistory[this.actions.indexOf(item.action)][item.index];

        // Look for the reference in the output stack from the last action,
        // as that represents the stack state at the beginning of this action.
        let currentDepth = stack.indexOf(realReference);

        if (currentDepth < 0) {
          let error = PrunedError.from(currentAction.prunedError);
          error.message = "Stack slot referenced in call to function " + currentAction.name + "() won't exist on the stack during runtime. Check instructions and ensure the slot hasn't been previously consumed.";
          throw error;
        }

        // Replace the stack reference with the correct instruction.
        // Don't return; instead, let the next block handle it.
        // 
        // Also make sure to catch stack reference replacement errors and 
        // return useful data about where the replacement error is occurring.
        // I *should* be able to use PrunedError.from() like above but
        // it doesn't appear to be working. So the below code is kindof
        // a cop out (that works). 
        try {
          item = item.getReplacement(currentDepth);
        } catch (e) {
          e.message = "in " + currentAction.name + "():" + currentAction.originalLineAndColumn().join(":") + " -- " + e.message
          throw e;
        }
      } 

      if (item instanceof Instruction) {
        let instruction = item;
        let [removed, added] = instruction.stackDelta();

        // If we have a swap instruction, and it wasn't a hot swap, 
        // then process the swap on the stack
        if (instruction.isSwap() && !(original instanceof HotSwapStackReference))  {
          // Get the array index of the swap value. e.g., if SWAP1/0x90, this will return reference at index 1
          let swapIndex = instruction.code - Instruction.SWAP1.code + 1; 

          if (swapIndex >= stack.length) {
            throw new Error("Cannot execute SWAP" + swapIndex + ": swap index out of range");
          }

          let top = stack[0];
          let toSwap = stack[swapIndex]; 

          stack[0] = toSwap;
          stack[swapIndex] = top; 
        }

        // Use ...Array() here to do something N times as a one-liner
        [...Array(removed)].forEach(() => stack.shift());
        [...Array(added)].forEach(() => stack.unshift(new StackReference()));
      }

      // If this is the last instruction of the action, save a shallow copy to stack history.
      if (itemIndex + 1 >= this.intermediate.length || this.parentActionIndexes[itemIndex + 1] != currentActionIndex) {
        this.stackHistory[currentActionIndex] = [...stack];
      }
      
      return item;
    })
  }

  processByteLengths() {
    // 1. Compute the byte lengths of each item in the intermediate representation
    // 2. Sum result to determine the total bytes at each index
    // 3. Create a record of Action indeces -> total bytes, as this represents the jump destination    
    this.bytesPerInstruction = this.intermediate.map((item) => byteLength(item))
    
    let sum = 0; 
    this.totalBytesAtInstruction = this.bytesPerInstruction
      .map((length) => {
        sum += length;
        return sum;
      }) 
  }

  processJumpDestinations() {
    Object.keys(this.actionInstructionStartIndex).forEach((idAsString:string) => {
      let id = parseInt(idAsString);
      let firstInstructionIndex = this.actionInstructionStartIndex[id];
      // Don't include the current byte length as that'll point to the following byte! 
      this.jumpDestinations[id] = BigInt(this.totalBytesAtInstruction[firstInstructionIndex] - this.bytesPerInstruction[firstInstructionIndex])
    });
  }

  toHex() {
    // Now loop through the intermediate representation translating
    // action pointers and label pointers to their final values.
    let bytecode = [];

    this.intermediate.forEach((item) => {
      let translation = translateToBytecode(item, this.executedCodeContext, this.jumpDestinations);

      if (translation) {
        bytecode.push(translation);
      }
    });

    let output = bytecode.map((item) => {
      let str = item.toString(16);
        
      while (str.length % 2 != 0) {
        str = "0" + str;
      }

      return str;
    }).join("");

    if (output.length % 2 != 0) {
      throw new Error("CRITICAL FAILURE: Final value has odd byte offset!")
    }

    output = "0x" + output.toUpperCase();

    return output;
  }
}