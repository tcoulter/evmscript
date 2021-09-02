// See https://ethervm.io/ for opcode reference
import { 
  Instruction, 
  LabelPointer, 
  HexableValue,
  Expression,
  ConcatedHexValue,
  JumpMap,
  WordRange,
  ByteRange,
  restrictInput,
  Padded,
  SolidityString
} from "./grammar";
import { byteLength } from "./helpers";
import { RuntimeContext } from ".";
import Enc from "@root/encoding";

export type ActionFunction = (context:RuntimeContext, ...args: HexableValue[]) => void;
export type ExpressionFunction = (context:RuntimeContext, ...args: Expression[]) => HexableValue;
export type ContextFunction = (context:RuntimeContext, ...args: Expression[]) => void;

function push(context:RuntimeContext, input:HexableValue) {
  restrictInput(input, "push");

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

// push input to stack in word by word and load into memory 
function alloc(context:RuntimeContext, input:HexableValue) {
  let length = byteLength(input);
  let wordIndex = 0;

  // Leave [offset, length,...] at the top of the stack
  push(context, length /*+ (32 - (length % 32))*/)
  context.intermediate.push(Instruction.MSIZE)                                    

  do {
    // If we don't have a full word, use a byte range and shift
    // the data into position. This allows us to deploy less bytecode.
    let bytesLeft = length - (wordIndex * 32);
    if (bytesLeft < 32) {
      push(context, new ByteRange(input, wordIndex * 32, bytesLeft)) // Only push what we need
      push(context, (32 - bytesLeft) * 8)                            // Then shift left what's left (bitwise shift)
      context.intermediate.push(Instruction.SHL);
    } else {
      push(context, new WordRange(input, wordIndex));   // Push 1 word to stack
    }
    
    context.intermediate.push(Instruction.MSIZE)      // Get the latest free memory offset
    context.intermediate.push(Instruction.MSTORE)     // Store word in memory

    wordIndex += 1;
  } while(wordIndex * 32 < length)
}

// Like alloc, but uses CODECOPY to load into memory. 
// Costs less gas, but could potentially insert JUMPDEST's that 
// could be jumped to accidentally/maliciously. 
function allocUnsafe(context:RuntimeContext, input:HexableValue) {
  let length = byteLength(input);

  let inputStart = context.getActionSource();
  let inputStartPtr = inputStart.getPointer();

  push(context, length);                            // Push the byte length of the input
  context.intermediate.push(Instruction.MSIZE);     // Get a free memory pointer       
  
  context.intermediate.push(Instruction.DUP2);      // Make a copy of the length   
  push(context, inputStartPtr);    // Push the offset of the code where _codeptr__ is stored
  context.intermediate.push(Instruction.DUP3);      // Copy the free memory pointer from above
  context.intermediate.push(Instruction.CODECOPY)   // Copy code into memory     

  //// Just tail things below:

  context.tail.push(inputStart);                    // Add start label and input at the end of
  context.tail.push(input)                          // the bytecode.
}

function jump(context:RuntimeContext, input:HexableValue) {
  if (typeof input != "undefined") {
    restrictInput(input, "jump");
    push(context, input);
  }
  context.intermediate.push(Instruction.JUMP);
}

function jumpi(context:RuntimeContext, input:HexableValue) {
  if (typeof input != "undefined") {
    restrictInput(input, "jumpi");
    push(context, input);
  }
  context.intermediate.push(Instruction.JUMPI);
}

function insert(context:RuntimeContext, ...args:HexableValue[]) {
  Array.prototype.push.apply(context.intermediate, args);
}

function revert(context:RuntimeContext, input:HexableValue) {
  if (typeof input != "undefined") {
    // TODO: Replace this with ABI encoding helpers
    // Spec here: https://docs.soliditylang.org/en/v0.8.7/abi-spec.html#examples
    alloc(context, new ConcatedHexValue(
      0x08c379a0,                     // Triggers "revert reason"
      new Padded(0x20, 32),           // Part of ABI encoding: it says that the data starts at the next word
      new SolidityString(input)
    ));
  } 
  context.intermediate.push(Instruction.REVERT);
}

function assertNonPayable(context:RuntimeContext, input:HexableValue) {
  let skipRevert = context.getActionSource(true);
  let skipRevertPtr = skipRevert.getPointer();

  Array.prototype.push.apply(context.intermediate, [
    Instruction.CALLVALUE,
    Instruction.ISZERO,
    Instruction.PUSH2,
    skipRevertPtr,
    Instruction.JUMPI
  ])

  if (typeof input == "undefined") {
    bail(context);
  } else {
    revert(context, input);
  }

  context.intermediate.push(skipRevert);
}

// Revert with no message
function bail(context:RuntimeContext) {
  Array.prototype.push.apply(context.intermediate, [
    Instruction.PUSH1,
    BigInt(0x0),
    Instruction.DUP1,
    Instruction.REVERT
  ]);
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

function $jumpmap(context:RuntimeContext, ...args:string[]) {
  return new JumpMap(...args);
}

function $bytelen(context:RuntimeContext, input:HexableValue) {
  return byteLength(input);
}

function $hex(context:RuntimeContext, input:HexableValue) {
  if (typeof input != "string") {
    throw new Error("Function $hex() can only be used on string literals.")
  }

  return BigInt("0x" + Enc.strToHex(input));
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
  alloc,
  allocUnsafe,
  assertNonPayable,
  bail,
  insert,
  jump,
  jumpi,
  push,
  revert
}

specificPushFunctions.forEach((fn, index) => {
  actionFunctions["push" + (index + 1)] = fn;
})

export const expressionFunctions:Record<string, ExpressionFunction> = {
  $bytelen,
  $concat,
  $hex,
  $jumpmap,
  $ptr
}

export const contextFunctions:Record<string, ContextFunction> = {
  $set
}
