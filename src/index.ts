import vm from 'vm';
import fs from "fs";
import path from "path";
import { ExpressionFunction, actionFunctions, expressionFunctions, contextFunctions, ContextFunction } from "./actions";
import { Instruction,IntermediateRepresentation, ActionPointer, ActionSource } from "./grammar";
import { byteLength, createActionHandler, createExpressionAndContextHandlers, translateToBytecode, UserFacingFunction } from './helpers';

export class RuntimeContext {
  deployable: boolean = false;
  intermediate: IntermediateRepresentation[] = []
  actionIndex: number = -1;

  getActionSource() {
    this.actionIndex += 1;
    return new ActionSource(this.actionIndex);
  }
}

export type CodeContext = Record<string, UserFacingFunction>;
export type ExecutedCodeContext = Record<string, any>;

export type ActionIndexToJumpDest = Record<number, BigInt>;

export function preprocess(code:string, extraContext:Record<string, any> = {}):string {

  let runtimeContext:RuntimeContext = new RuntimeContext();

  // Set some custom context functions, taking in what's passed by the user
  let codeContext:CodeContext = {
    ...extraContext 
  }

  let nonActionFunctions:Record<string, ExpressionFunction|ContextFunction> = {
    ...expressionFunctions,
    ...contextFunctions
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

  Object.keys(nonActionFunctions)
    .filter((key) => typeof nonActionFunctions[key] == "function")
    .map<[string, UserFacingFunction]>((key) => [key, createExpressionAndContextHandlers(runtimeContext, key, nonActionFunctions[key])])
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
          runtimeContext.intermediate.push(Instruction[key]);
        })
      ]
    })
    .forEach(([key, fn]) => codeContext[internalFunctionPrefix + key] = fn)
 
  // Translate all internalFunctionPrefix'd keys to having the underscore removed, by adding
  // a preamble to the code. This ensures the user will receive an error if they
  // accidentally define a function of the same name. 
  Object.keys(codeContext).forEach((key) => {
    if (key.indexOf(internalFunctionPrefix) >= 0) {
      let nonPrefixedKey = key.replace(internalFunctionPrefix, "");
      code = `const ${nonPrefixedKey} = this.${key};` + code;
    }
  })

  //// Run a first pass, which evaluates the input and turns it into
  //// an intermediate representation.
  vm.runInNewContext(code, codeContext);

  // Note: After execution, node can set values of any type to the context,
  // so we can't rely on types here. Let's make that explicit.
  let executedCodeContext:ExecutedCodeContext = codeContext;

  // Explore the codeContext for any variables of type ActionPointer.
  // If they exist, it means a jumpable label was set in the code.
  // Let's updated the associated ActionSource and mark it as used. 
  // This will ensure a JUMPDEST gets added in its place.
  Object.keys(executedCodeContext)
    .filter((key) => executedCodeContext[key] instanceof ActionPointer)
    .map<ActionPointer>((key) => executedCodeContext[key])
    .forEach((actionPointer) => actionPointer.actionSource.setIsUsed())

  // 1. Compute the byte lengths of each item in the intermediate representation
  // 2. Sum result to determine the total bytes at each index
  // 3. Create a record of ActionSource indeces -> total bytes, as this represents the jump destination 
  let jumpDestinations:ActionIndexToJumpDest = {};
  let byteLengths = runtimeContext.intermediate
    .map((item) => byteLength(item))

  let sum = 0; 
  byteLengths
    .map((length) => {
      sum += length;
      return sum;
    }) 
    .forEach((totalBytes, index) => {
      let item = runtimeContext.intermediate[index];

      if (!(item instanceof ActionSource)) {
        return;
      }

      // Don't include the current byte length as that'll point to the following byte! 
      jumpDestinations[item.actionIndex] = BigInt(totalBytes - byteLengths[index]);
    })

  // Now loop through the intermediate representation translating
  // action pointers and label pointers to their final values.
  let bytecode = [];

  runtimeContext.intermediate.forEach((item) => {
    let translation = translateToBytecode(item, executedCodeContext, jumpDestinations);

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
  return preprocess(input, extraContext);
}