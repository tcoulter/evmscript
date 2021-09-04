// See https://ethervm.io/ for opcode reference
import {  
  LabelPointer, 
  HexableValue,
  Expression,
  ConcatedHexValue,
  JumpMap,
  WordRange,
  ByteRange,
  Padded,
  SolidityString,
  SolidityTypes,
  ActionPointer,
  IntermediateRepresentation,
  Action,
  Instruction
} from "./grammar";
import { byteLength, createShorthandAction } from "./helpers";
import { RuntimeContext } from "./index";
import Enc from "@root/encoding";
import ensure from "./ensure";
import { ethers } from "ethers";
import expectExport from "expect";

export type ActionFunction = (context:RuntimeContext, intermediate:IntermediateRepresentation[], ...args: Expression[]) => Action[]|void;
export type ExpressionFunction = (...args: Expression[]) => HexableValue;
export type ContextFunction = (context:RuntimeContext, ...args: Expression[]) => void;

export type DispatchRecord = Record<string, ActionPointer|LabelPointer>;

function push(context:RuntimeContext, intermediate:IntermediateRepresentation[], input:HexableValue) {
  ensure(input).isHexable()
  ensure(input).is32BytesOrLess();

  intermediate.push(
    Instruction["PUSH" + byteLength(input)],
    input
  )
}

// Create actions for all the push functions, translating to the generalized push function
let specificPushFunctions:Array<ActionFunction> =  Array.from(Array(32).keys()).map((index) => {
  return function(context:RuntimeContext, intermediate:IntermediateRepresentation[], input:HexableValue) {
    // Since the byte length was requested specifically, lets make
    // the user passed the right amount of bytes.
    let expectedByteLength = index + 1;
    let actualByteLength = byteLength(input);

    if (actualByteLength != expectedByteLength) {
      throw new Error(`Function push${expectedByteLength}() expected ${expectedByteLength} bytes but received ${actualByteLength}.`);
    }

    intermediate.push(
      Instruction["PUSH" + (index + 1)],
      input
    )
  }
})

// push input to stack in word by word and load into memory 
function alloc(context:RuntimeContext, intermediate:IntermediateRepresentation[], input:HexableValue) {
  let length = byteLength(input);
  let wordIndex = 0;

  // Leave [offset, length,...] at the top of the stack
  push(context, intermediate, length)
  intermediate.push(Instruction.MSIZE)                                    

  do {
    // If we don't have a full word, use a byte range and shift
    // the data into position. This allows us to deploy less bytecode.
    let bytesLeft = length - (wordIndex * 32);
    if (bytesLeft < 32) {
      push(context, intermediate, new ByteRange(input, wordIndex * 32, bytesLeft)) // Only push what we need
      push(context, intermediate, (32 - bytesLeft) * 8)                            // Then shift left what's left (bitwise shift)
      intermediate.push(Instruction.SHL);
    } else {
      push(context, intermediate, new WordRange(input, wordIndex));   // Push 1 word to stack
    }
    
    intermediate.push(Instruction.MSIZE)      // Get the latest free memory offset
    intermediate.push(Instruction.MSTORE)     // Store word in memory

    wordIndex += 1;
  } while(wordIndex * 32 < length)
}

// Like alloc, but uses CODECOPY to load into memory. 
// Costs less gas, but could potentially insert JUMPDEST's that 
// could be jumped to accidentally/maliciously. 
function allocUnsafe(context:RuntimeContext, intermediate:IntermediateRepresentation[], input:HexableValue) {
  let length = byteLength(input);

  let inputStart = new Action();
  let inputStartPtr = inputStart.getPointer();

  push(context, intermediate, length);                            // Push the byte length of the input
  intermediate.push(Instruction.MSIZE);     // Get a free memory pointer       
  
  intermediate.push(Instruction.DUP2);      // Make a copy of the length   
  push(context, intermediate, inputStartPtr);    // Push the offset of the code where _codeptr__ is stored
  intermediate.push(Instruction.DUP3);      // Copy the free memory pointer from above
  intermediate.push(Instruction.CODECOPY)   // Copy code into memory     

  //// Just tail things below:

  // Add input at the end of the bytecode, as an action
  // (so it can be pointed to in the code above.)
  inputStart.intermediate.push(input)
  context.pushTailAction(inputStart)
}

function allocStack(context:RuntimeContext, intermediate:IntermediateRepresentation[], amount:number) {
  ensure(amount).isOfType("number")

  for (var i = 0; i < amount; i++) {
    intermediate.push(
      // Note: MSTORE gobbles up a value each time
      Instruction.MSIZE,
      Instruction.MSTORE
    )
  }

  push(context, intermediate, amount * 32)
  intermediate.push(
    // Calculate the start offset by length from the current free memory index
    Instruction.DUP1,   
    Instruction.MSIZE,
    Instruction.SUB
  )
}

function pushCallDataOffsets(context:RuntimeContext, intermediate:IntermediateRepresentation[], ...args:string[]) {
  args.forEach((typeString) => ensure(typeString).isSolidityType());

  // Loop through items placing ([value,...] | [offset, length, ...])
  // on the stack in reverse order, so the first item is at the top of the stack.
  // This ensures that you don't have to change code when new values are added later 

  push(context, intermediate, 4 + (32 * (args.length - 1))); // Start at the last item

  args.reverse().forEach((typeString, index) => {
    switch(typeString) {
      case SolidityTypes.uint:
        // uints are abi encoded simply by its value [uint value, ...]

        intermediate.push(
          Instruction.DUP1,           // Copy the calldata offset
          Instruction.CALLDATALOAD,   // Load the value of the uint
          Instruction.SWAP1,          // Swap the value and the existing offset
        )
        break;
      case SolidityTypes.bytes: 
        // bytes is abi encoded as [bytes calldata location, ..., bytes length, bytes data]
        // where `bytes length` is located at the bytes calldata location.

        // TODO: See if I can make this more efficent with less swapping
        intermediate.push(
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
        )
        break;
    }

    if (index < args.length - 1) {
      intermediate.push(
        Instruction.PUSH1,          // Subtract 32 from the offset, moving backwards to the next item
        0x20, 
        Instruction.SWAP1,
        Instruction.SUB
      )
    }

  })

  // Clean up the last calldata offset
  intermediate.push(Instruction.POP);
}

function calldataload(context:RuntimeContext, intermediate:IntermediateRepresentation[], offset:HexableValue, lengthInBytes:number = 32) {
  if (typeof offset != "undefined") {
    expectExport(lengthInBytes).toBeLessThanOrEqual(32);

    push(context, intermediate, offset)
    intermediate.push(Instruction.CALLDATALOAD);

    if (lengthInBytes != 32) {
      shr(context, intermediate, (32 - lengthInBytes) * 8)
    }
  } else {
    intermediate.push(Instruction.CALLDATALOAD);
  }
}

function jump(context:RuntimeContext, intermediate:IntermediateRepresentation[], input:HexableValue) {
  if (typeof input != "undefined") {
    ensure(input).is32BytesOrLess();
    push(context, intermediate, input);
  }
  intermediate.push(Instruction.JUMP);
}

function jumpi(context:RuntimeContext, intermediate:IntermediateRepresentation[], input:HexableValue) {
  if (typeof input != "undefined") {
    ensure(input).is32BytesOrLess();
    push(context, intermediate, input);
  }
  intermediate.push(Instruction.JUMPI);
}

function dispatch(context:RuntimeContext, intermediate:IntermediateRepresentation[], mapping:DispatchRecord) {
  Object.keys(mapping).forEach((solidityFunction) => {
    let pointer:ActionPointer|LabelPointer = mapping[solidityFunction];

    ensure(solidityFunction).isOfType("string");
    ensure(pointer).isPointer();

    // Get rid of the "function " prefix because ethers doesn't like it.
    let indexOfFunction = solidityFunction.indexOf("function ");

    if (indexOfFunction == 0) {
      solidityFunction = solidityFunction.substr(9)
    }

    let fragment = ethers.utils.FunctionFragment.from(solidityFunction);
    let signature = fragment.format(ethers.utils.FormatTypes.sighash);
    let signatureAsHex = "0x" + Enc.strToHex(signature)
    let fourBytes = ethers.utils.keccak256(signatureAsHex).substr(0, 10) // 4 bytes + 0x prefix!

    // Load the 4-byte sig from calldata onto the stack
    // TODO: See if there's a way to not do this for each item
    calldataload(context, intermediate, 0, 4);

    intermediate.push(
      Instruction.PUSH4,        // Push this function's 4-byte sig
      BigInt(fourBytes),
      Instruction.EQ,           // Check equality
      Instruction.PUSH2,
      pointer,              
      Instruction.JUMPI         // Jump to our pointer if they match!
    )
  })
}

function insert(context:RuntimeContext, intermediate:IntermediateRepresentation[], ...args:HexableValue[]) {
  intermediate.push(...args);
}

function revert(context:RuntimeContext, intermediate:IntermediateRepresentation[], input:HexableValue) {
  if (typeof input != "undefined") {
    // TODO: Replace this with ABI encoding helpers
    // Spec here: https://docs.soliditylang.org/en/v0.8.7/abi-spec.html#examples
    alloc(context, intermediate, new ConcatedHexValue(
      0x08c379a0,                     // Triggers "revert reason"
      new Padded(0x20, 32),           // Part of ABI encoding: it says that the data starts at the next word
      new SolidityString(input)
    ));
  } 
  intermediate.push(Instruction.REVERT);
}

function assertNonPayable(context:RuntimeContext, intermediate:IntermediateRepresentation[], input:HexableValue) {
  let skipRevert = new Action(true);
  let skipRevertPtr = skipRevert.getPointer();

  intermediate.push(
    Instruction.CALLVALUE,
    Instruction.ISZERO,
    Instruction.PUSH2,
    skipRevertPtr,
    Instruction.JUMPI
  )

  if (typeof input == "undefined") {
    bail(context, intermediate);
  } else {
    revert(context, intermediate, input);
  }

  return [skipRevert];
}

// Revert with no message
function bail(context:RuntimeContext, intermediate:IntermediateRepresentation[]) {
  intermediate.push(
    Instruction.PUSH1,
    BigInt(0x0),
    Instruction.DUP1,
    Instruction.REVERT
  );
}

const add = createShorthandAction(Instruction.ADD);
const mul = createShorthandAction(Instruction.MUL);
const sub = createShorthandAction(Instruction.SUB, true);
const div = createShorthandAction(Instruction.DIV, true);
const sdiv = createShorthandAction(Instruction.SDIV, true);
const mod = createShorthandAction(Instruction.MOD, true);
const smod = createShorthandAction(Instruction.SMOD, true);
const exp = createShorthandAction(Instruction.EXP, true);
const lt = createShorthandAction(Instruction.LT, true);
const gt = createShorthandAction(Instruction.GT, true);
const slt = createShorthandAction(Instruction.SLT, true);
const sgt = createShorthandAction(Instruction.SGT, true);
const eq = createShorthandAction(Instruction.EQ);
const not = createShorthandAction(Instruction.NOT);
const shr = createShorthandAction(Instruction.SHR);
const shl = createShorthandAction(Instruction.SHL);
const sar = createShorthandAction(Instruction.SAR);

const balance = createShorthandAction(Instruction.BALANCE);
const extcodesize = createShorthandAction(Instruction.EXTCODESIZE);
const extcodehash = createShorthandAction(Instruction.EXTCODEHASH);
const blockhash = createShorthandAction(Instruction.BLOCKHASH);

const mload = createShorthandAction(Instruction.MLOAD);

//// Expression functions

function $set(context:RuntimeContext, key:string, value:string) {
  // TODO: key and value check; don't let users set wrong stuff/set incorrectly
  context[key.toString().trim()] = value;
}

function $ptr(labelName:string) {
  return new LabelPointer(labelName);
}

function $concat(...args:HexableValue[]) {
  return new ConcatedHexValue(...args);
}

function $jumpmap(...args:string[]) {
  return new JumpMap(...args);
}

function $bytelen(input:HexableValue) {
  return byteLength(input);
}

function $hex(input:HexableValue) {
  if (typeof input != "string") {
    throw new Error("Function $hex() can only be used on string literals.")
  }

  return BigInt("0x" + Enc.strToHex(input));
}

function $pad(input:HexableValue, lengthInBytes:number, side:("left"|"right") = "left") {
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
  add,
  alloc,
  allocStack,
  allocUnsafe,
  assertNonPayable,
  balance,
  bail,
  blockhash,
  dispatch,
  div,
  eq,
  exp,
  extcodehash,
  extcodesize,
  gt, 
  insert,
  jump,
  jumpi,
  lt,
  mload,
  mod,
  mul,
  not,
  push,
  pushCallDataOffsets,
  sar,
  sdiv,
  sgt,
  shl,
  shr,
  slt,
  smod,
  sub,
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
