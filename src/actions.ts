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
  Padded,
  SolidityString,
  SolidityTypes
} from "./grammar";
import { byteLength } from "./helpers";
import { RuntimeContext } from ".";
import Enc from "@root/encoding";
import ensure from "./ensure";

export type ActionFunction = (context:RuntimeContext, ...args: Expression[]) => void;
export type ExpressionFunction = (context:RuntimeContext, ...args: Expression[]) => HexableValue;
export type ContextFunction = (context:RuntimeContext, ...args: Expression[]) => void;

function push(context:RuntimeContext, input:HexableValue) {
  ensure(input).isHexable()
  ensure(input).is32BytesOrLess();

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

function allocStack(context:RuntimeContext, amount:number) {
  ensure(amount).isNumber()

  for (var i = 0; i < amount; i++) {
    Array.prototype.push.apply(context.intermediate, [
      // Note: MSTORE gobbles up a value each time
      Instruction.MSIZE,
      Instruction.MSTORE
    ])
  }

  push(context, amount * 32)
  Array.prototype.push.apply(context.intermediate, [
    // Calculate the start offset by length from the current free memory index
    Instruction.DUP1,   
    Instruction.MSIZE,
    Instruction.SUB
  ])
}

function pushCallDataOffsets(context:RuntimeContext, ...args:string[]) {
  args.forEach((typeString) => ensure(typeString).isSolidityType());

  // Loop through items placing ([value,...] | [offset, length, ...])
  // on the stack in reverse order, so the first item is at the top of the stack.
  // This ensures that you don't have to change code when new values are added later 

  push(context, 4 + (32 * (args.length - 1))); // Start at the last item

  args.reverse().forEach((typeString, index) => {
    switch(typeString) {
      case SolidityTypes.uint:
        // uints are abi encoded simply by its value [uint value, ...]

        Array.prototype.push.apply(context.intermediate, [
          Instruction.DUP1,           // Copy the calldata offset
          Instruction.CALLDATALOAD,   // Load the value of the uint
          Instruction.SWAP1,          // Swap the value and the existing offset
        ])
        break;
      case SolidityTypes.bytes: 
        // bytes is abi encoded as [bytes calldata location, ..., bytes length, bytes data]
        // where `bytes length` is located at the bytes calldata location.

        // TODO: See if I can make this more efficent with less swapping
        Array.prototype.push.apply(context.intermediate, [
          Instruction.DUP1,           // Copy the calldata offset                           => [calldata offset, calldata offset, ...]
          Instruction.CALLDATALOAD,   // Load the location of the bytes array in call data  => [location, calldata offset, ...]
          Instruction.PUSH1,          // Add 4 to location to account for function id       => [location, calldata offset, ...]
          0x4,
          Instruction.ADD,
          Instruction.SWAP1,          // Swap location and calldata offset                  => [calldata offset, location, ...]
          Instruction.DUP2,           // Copy the location                                  => [location, calldata offset, location, ...]
          Instruction.CALLDATALOAD,   // Use the location to load the length of the array   => [length, calldata offset, location, ...]
          Instruction.SWAP2,          // Swap length and location                           => [location, calldata offset, length, ...]
          Instruction.PUSH1,          // Add 32 to the location, giving the start of data   => [data start, calldata offset, length, ...]
          0x20,
          Instruction.ADD,
          Instruction.SWAP1           // Finally, swap data start and calldata offset       => [calldata offset, data start, length, ...]
                                      // leaving the existing offset at the top of the stack
        ])
        break;
    }

    if (index < args.length - 1) {
      Array.prototype.push.apply(context.intermediate, [
        Instruction.PUSH1,          // Subtract 32 from the offset, moving backwards to the next item
        0x20, 
        Instruction.SWAP1,
        Instruction.SUB
      ])
    }

  })

  // Clean up the last calldata offset
  context.intermediate.push(Instruction.POP);
}

function jump(context:RuntimeContext, input:HexableValue) {
  if (typeof input != "undefined") {
    ensure(input).is32BytesOrLess();
    push(context, input);
  }
  context.intermediate.push(Instruction.JUMP);
}

function jumpi(context:RuntimeContext, input:HexableValue) {
  if (typeof input != "undefined") {
    ensure(input).is32BytesOrLess();
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

//function allocSolidityCallData

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

function $pad(context:RuntimeContext, input:HexableValue, lengthInBytes:number, side:("left"|"right") = "left") {
  return new Padded(input, lengthInBytes, side);
}

// Ideas: 
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
  allocStack,
  allocUnsafe,
  assertNonPayable,
  bail,
  insert,
  jump,
  jumpi,
  push,
  pushCallDataOffsets,
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
  $pad,
  $ptr
}

export const contextFunctions:Record<string, ContextFunction> = {
  $set
}
