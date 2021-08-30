// See https://ethervm.io/ for opcode reference
import { 
  Instruction, 
  IntermediateRepresentation, 
  LabelPointer, 
  HexableValue,
  Expression,
  ActionPointer,
  ConcatedHexValue
} from "./grammar";
import { byteLength } from "./helpers";
import { RuntimeContext } from "./preprocess";

export type ActionFunction = (context:RuntimeContext, ...args: HexableValue[]) => void;
export type ExpressionFunction = (context:RuntimeContext, ...args: Expression[]) => HexableValue;
export type ContextFunction = (context:RuntimeContext, ...args: Expression[]) => void;

function push(context:RuntimeContext, input:HexableValue) {
  Array.prototype.push.apply(context.intermediate, [
    Instruction["PUSH" + byteLength(input)],
    input
  ])
}

// Create actions for all the push functions, translating to the generalized push function
let specificPushFunctions:Array<ActionFunction> =  Array.from(Array(32).keys()).map((index) => {
  return function(context:RuntimeContext, input:HexableValue) {
    // Since the byte length was requested specifically, lets make
    // the user passed the right amount of bytes.
    let expectedByteLength = index + 1;
    let actualByteLength = byteLength(input);

    if (actualByteLength != expectedByteLength) {
      throw new Error(`Function push${expectedByteLength}() expected ${expectedByteLength} bytes but received ${actualByteLength}.`);
    }

    Array.prototype.push.apply(context.intermediate, [
      Instruction["PUSH" + (index + 1)],
      input
    ])
  }
})

function getmem(context:RuntimeContext) {
  Array.prototype.push.apply(context.intermediate, [
    Instruction.PUSH1,
    BigInt(0x40),
    Instruction.MLOAD
  ]);
}

function goto(context:RuntimeContext, input:HexableValue) {
  push(context, input);
  context.intermediate.push(Instruction.JUMP);
}

function $set(context:RuntimeContext, key:string, value:string) {
  // TODO: key and value check; don't let users set wrong stuff/set incorrectly
  context[key.toString().trim()] = value;
}

function $ptr(context:RuntimeContext, labelName:string) {
  return new LabelPointer(labelName);
}

function $concat(context:RuntimeContext, ...args:HexableValue[]) {
  return new ConcatedHexValue(...args);
}

// Ideas: 
// 
// $hex -> convert to hex
// e.g., $hex("this is a revert string")
//
// revert("this is a revert string")  // even better?
//
// $keccak -> sha3, for defining solidity functions
// e.g. $keccak("setOwner(address)").substring(0, 4)
//  or? $keccak4(...)
//  or? $keccak("setOwner(address)", 4)
//  or  $keccak(...) and $4byte(...) or something?
//
//  callSolidity(/*address*/ "0x...", "someFunction(address, uint)", ... params ...)
//
//  insert(...hex string..) -> directly insert bytecode at specified position. Check validity?

export const actionFunctions:Record<string, ActionFunction> = {
  push,
  getmem,
  goto
}

specificPushFunctions.forEach((fn, index) => {
  actionFunctions["push" + (index + 1)] = fn;
})

export const expressionFunctions:Record<string, ExpressionFunction> = {
  $concat,
  $ptr
}

export const contextFunctions:Record<string, ContextFunction> = {
  $set
}
