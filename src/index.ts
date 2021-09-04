import vm from 'vm';
import fs from "fs";
import path from "path";
import os from "os";
import { ExpressionFunction, actionFunctions, expressionFunctions, contextFunctions, ContextFunction } from "./actions";
import { ActionPointer, StackReference, Action, Instruction } from "./grammar";
import { byteLength, createActionHandler, createContextHandler, createExpressionAndContextHandlers, createExpressionHandler, translateToBytecode, UserFacingFunction } from './helpers';

export class RuntimeContext {
  deployable: boolean = false;
  actions: Action[] = [];
  tail: Action[] = [];
  stack: Array<StackReference> = [];

  pushAction(action:Action) {
    action.intermediate
      .filter((item) => item instanceof Instruction)
      .forEach((instruction:Instruction) => {
        let [removed, added] = instruction.stackDelta();

        // Use Array here to do something N times as a one-liner
        [...Array(removed)].forEach(() => this.stack.pop());
        [...Array(added)].forEach(() => this.stack.push(new StackReference()));
      
        // TODO: Manage swaps.
      })

    action.stack = [...this.stack];

    this.actions.push(action);
  }

  pushTailAction(action:Action) {
    // We'll do processing later! 
    this.tail.push(action);
  }
}

export type CodeContext = Record<string, UserFacingFunction>;
export type ExecutedCodeContext = Record<string, any>;

export type ActionIndexToCodeLocation = Record<number, BigInt>;

export function preprocess(code:string, extraContext:Record<string, any> = {}, filename:string = "bytecode"):string {

  let runtimeContext:RuntimeContext = new RuntimeContext();

  // Set some custom context functions, taking in what's passed by the user
  let codeContext:CodeContext = {
    ...extraContext 
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
  
  // Add default functions for instructions without set functions
  // This will take the instruction names and lower case them,
  // returning a function that simply returns the instruction.
  let reservedWords = {"return":"ret"};

  // Create default functions for any instructions that don't have 
  // already defined action functions. 
  Object.keys(Instruction)
    .filter((key) => isNaN(parseInt(key)))  // enums have numeric keys too; filter those out
    .filter((key) => !actionFunctions[key.toLowerCase()]) // filter out instructions with named actions
    .map<[string, UserFacingFunction]>((key) => {
      let lowercaseKey = key.toLowerCase();

      if (reservedWords[lowercaseKey]) {
        lowercaseKey = reservedWords[lowercaseKey];
      }

      return [
        lowercaseKey,
        createActionHandler(runtimeContext, lowercaseKey, () => {
          runtimeContext.actions.push(Instruction[key]);
        })
      ]
    })
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
    vm.runInNewContext(code, codeContext, {
      filename,
      lineOffset: (-preamble.split(/\r?\n/).length) + 1
    });
  } catch (e) {
    // Prune stack beyond bytecode 
    if (e instanceof Error) {
      let stackLines = e.stack.split(/\r?\n/);
      let found = false;

      e.stack = stackLines.filter((line) => {
        if (!found && line.indexOf("at bytecode") >= 0) {
          found = true;
          return true;
        }
        return !found;
      }).join(os.EOL)
    }

    throw e; 
  } 

  // After processing, concatenate the intermediate representation and tail data
  runtimeContext.actions = [...runtimeContext.actions, ...runtimeContext.tail];
  runtimeContext.tail = [] // for good measure

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

  // 1. Compute the byte lengths of each item in the intermediate representation
  // 2. Sum result to determine the total bytes at each index
  // 3. Create a record of ActionSource indeces -> total bytes, as this represents the jump destination 
  let codeLocations:ActionIndexToCodeLocation = {};
  let byteLengths = runtimeContext.actions
    .map((item) => byteLength(item))

  let sum = 0; 
  byteLengths
    .map((length) => {
      sum += length;
      return sum;
    }) 
    .forEach((totalBytes, index) => {
      let item = runtimeContext.actions[index];

      if (!(item instanceof Action)) {
        return;
      }

      // Don't include the current byte length as that'll point to the following byte! 
      codeLocations[item.id] = BigInt(totalBytes - byteLengths[index]);
    })

  // Now loop through the intermediate representation translating
  // action pointers and label pointers to their final values.
  let bytecode = [];

  runtimeContext.actions.forEach((item) => {
    let translation = translateToBytecode(item, executedCodeContext, codeLocations);

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