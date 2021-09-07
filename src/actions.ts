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
  Instruction,
  RelativeStackReference,
  ActionParameter
} from "./grammar";
import { byteLength, createActionHandler } from "./helpers";
import { RuntimeContext } from "./index";
import Enc from "@root/encoding";
import ensure from "./ensure";
import { ethers } from "ethers";

export type ActionFunction = (...args: Expression[]) => Action;
export type ExpressionFunction = (...args: Expression[]) => HexableValue;
export type ContextFunction = (context:RuntimeContext, ...args: Expression[]) => void;

export type DispatchRecord = Record<string, ActionPointer|LabelPointer>;

function push(input:ActionParameter):Action {
  if (input instanceof Action) {
    throw new Error("push() cannot accept the results of other actions. Please check your code to ensure push() only receives preprocessable data.")
  }

  let action = new Action("push");

  ensure(input).isHexable()
  ensure(input).is32BytesOrLess();

  action.intermediate.push(
    Instruction["PUSH" + byteLength(input)],
    input
  )

  return action;
}

// Create actions for all the push functions, translating to the generalized push function
let specificPushFunctions:Array<ActionFunction> =  Array.from(Array(32).keys()).map<ActionFunction>((index) => {
  return function(input:HexableValue) {
    // Since the byte length was requested specifically, lets make
    // the user passed the right amount of bytes.
    let expectedByteLength = index + 1;
    let actualByteLength = byteLength(input);

    if (actualByteLength != expectedByteLength) {
      throw new Error(`Function push${expectedByteLength}() expected ${expectedByteLength} bytes but received ${actualByteLength}.`);
    }

    let instructionName = "PUSH" + (index + 1);
    let action = new Action(instructionName.toLowerCase());

    action.intermediate.push(
      Instruction[instructionName],
      input
    )

    return action;
  }
})

// push input to stack in word by word and load into memory 
function alloc(input:HexableValue) {
  let length = byteLength(input);
  let wordIndex = 0;

  let action = new Action("alloc");

  // Leave [offset, length,...] at the top of the stack
  action.push(push(length));
  action.push(Instruction.MSIZE)                                    

  do {
    // If we don't have a full word, use a byte range and shift
    // the data into position. This allows us to deploy less bytecode.
    let bytesLeft = length - (wordIndex * 32);
    if (bytesLeft < 32) {
      action.push(
        push(new ByteRange(input, wordIndex * 32, bytesLeft)), // Only push what we need
        push((32 - bytesLeft) * 8),                            // Then shift left what's left (bitwise shift)
        Instruction.SHL
      );
    } else {
      action.push(push(new WordRange(input, wordIndex)));   // Push 1 word to stack
    }
    
    action.push(Instruction.MSIZE)      // Get the latest free memory offset
    action.push(Instruction.MSTORE)     // Store word in memory

    wordIndex += 1;
  } while(wordIndex * 32 < length)

  return action;
}

// Like alloc, but uses CODECOPY to load into memory. 
// Costs less gas, but could potentially insert JUMPDEST's that 
// could be jumped to accidentally/maliciously. 
function allocUnsafe(input:HexableValue) {
  let length = byteLength(input);

  let action = new Action("allocUnsafe");

  let inputStart = new Action("allocUnsafe:inputStart");
  let inputStartPtr = inputStart.getPointer();
  inputStart.push(input);

  action.push(
    push(length),          // Push the byte length of the input
    Instruction.MSIZE,     // Get a free memory pointer       
    
    Instruction.DUP2,      // Make a copy of the length   
    push(inputStartPtr),     // Push the offset of the code where _codeptr__ is stored
    Instruction.DUP3,      // Copy the free memory pointer from above
    Instruction.CODECOPY   // Copy code into memory     
  )

  // Add input at the end of the bytecode, as an action
  // so it can be pointed to in the code above.
  action.pushTail(inputStart)

  return action;
}

function allocStack(amount:number) {
  ensure(amount).isOfType("number")

  let action = new Action("allocStack");

  for (var i = 0; i < amount; i++) {
    action.push(
      // Note: MSTORE gobbles up a value each time
      Instruction.MSIZE,
      Instruction.MSTORE
    )
  }

  action.push(push(amount * 32))
  action.push(
    // Calculate the start offset by length from the current free memory index
    Instruction.DUP1,   
    Instruction.MSIZE,
    Instruction.SUB
  )

  return action;
}

function pushCallDataOffsets(...args:string[]) {
  args.forEach((typeString) => ensure(typeString).isSolidityType());

  let action = new Action("pushCallDataOffsets");

  // Loop through items placing ([value,...] | [offset, length, ...])
  // on the stack in reverse order, so the first item is at the top of the stack.
  // This ensures that you don't have to change code when new values are added later 

  action.push(
    push(4 + (32 * (args.length - 1)))
  ); // Start at the last item

  args.reverse().forEach((typeString, index) => {
    switch(typeString) {
      case SolidityTypes.uint:
        // uints are abi encoded simply by its value [uint value, ...]

        action.push(
          Instruction.DUP1,           // Copy the calldata offset
          Instruction.CALLDATALOAD,   // Load the value of the uint
          Instruction.SWAP1,          // Swap the value and the existing offset
        )
        break;
      case SolidityTypes.bytes: 
        // bytes is abi encoded as [bytes calldata location, ..., bytes length, bytes data]
        // where `bytes length` is located at the bytes calldata location.

        // TODO: See if I can make this more efficent with less swapping
        action.push(
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
      action.push(
        Instruction.PUSH1,          // Subtract 32 from the offset, moving backwards to the next item
        0x20, 
        Instruction.SWAP1,
        Instruction.SUB
      )
    }
  })

  // Clean up the last calldata offset
  action.push(Instruction.POP);

  return action;
}

function calldataload(offset:HexableValue, lengthInBytes:number = 32) {
  let action = new Action("calldataload");

  if (typeof offset != "undefined") {
    ensure(lengthInBytes).toBeLessThanOrEqual(32);

    action.push(
      push(offset), 
      Instruction.CALLDATALOAD
    )

    if (lengthInBytes != 32) {
      action.push(
        actionFunctions.shr((32 - lengthInBytes) * 8)
      )
    }
  } else {
    action.push(Instruction.CALLDATALOAD);
  }

  return action;
}

function jump(input:HexableValue) {
  let action = new Action("jump");

  if (typeof input != "undefined") {
    ensure(input).is32BytesOrLess();
    action.push(push(input));
  }
  action.push(Instruction.JUMP);

  return action;
}

function jumpi(input:HexableValue) {
  let action = new Action("jumpi");

  if (typeof input != "undefined") {
    ensure(input).is32BytesOrLess();
    action.push(push(input));
  }
  action.push(Instruction.JUMPI);

  return action;
}

function dispatch(mapping:DispatchRecord) {
  let action = new Action("dispatch");

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
    action.push(calldataload(0, 4));

    action.push(
      Instruction.PUSH4,        // Push this function's 4-byte sig
      BigInt(fourBytes),
      Instruction.EQ,           // Check equality
      Instruction.PUSH2,
      pointer,              
      Instruction.JUMPI         // Jump to our pointer if they match!
    )
  })

  return action;
}

function insert(...args:HexableValue[]) {
  let action = new Action("insert");

  action.push(...args);

  return action;
}

function revert(input:HexableValue) {
  let action = new Action("revert");

  if (typeof input != "undefined") {
    // TODO: Replace this with ABI encoding helpers
    // Spec here: https://docs.soliditylang.org/en/v0.8.7/abi-spec.html#examples
    action.push(alloc(new ConcatedHexValue(
      0x08c379a0,                     // Triggers "revert reason"
      new Padded(0x20, 32),           // Part of ABI encoding: it says that the data starts at the next word
      new SolidityString(input)
    )));
  } 
  action.push(Instruction.REVERT);

  return action;
}

function assertNonPayable(input:HexableValue) {
  let action = new Action("assertNonPayable");

  let skipRevert = new Action("assertNonPayable:skipRevert");
  skipRevert.setIsJumpDestination();
  let skipRevertPtr = skipRevert.getPointer();

  action.push(
    Instruction.CALLVALUE,
    Instruction.ISZERO,
    Instruction.PUSH2,
    skipRevertPtr,
    Instruction.JUMPI
  )

  if (typeof input == "undefined") {
    action.push(bail());
  } else {
    action.push(revert(input));
  }

  action.push(skipRevert);

  return action;
}

// Revert with no message
function bail() {
  let action = new Action("bail");

  action.push(
    Instruction.PUSH1,
    BigInt(0x0),
    Instruction.DUP1,
    Instruction.REVERT
  );

  return action;
}


export function createDefaultAction(name:string, instruction:Instruction, swapBeforeInstruction:boolean = false) {
  return function(...args:ActionParameter[])  {
    let action = new Action(name)

    if (args.length > 0) {
      // Leave stack references alone; otherwise push anything else passed. 
      // Do this in reverse order as later params are lower in the stack.
      args.reverse().forEach((item) => {
        if (item instanceof RelativeStackReference) {
          action.push(item)
        } else {
          action.push(actionFunctions.push(item))
        }
      })
      if (swapBeforeInstruction) {
        action.push(Instruction.SWAP1);
      }
    }
    action.push(instruction);

    return action;
  }
}

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
  alloc,
  allocStack,
  allocUnsafe,
  assertNonPayable,
  bail,
  dispatch,
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

// Create default actions for any instructions that don't have 
// already defined action functions. 
let reservedWords = {"return":"ret"};
Object.keys(Instruction)
  .filter((key) => isNaN(parseInt(key)))                            // enums have numeric keys too; filter those out
  .map<[string, string]>((key) => [key, key.toLowerCase()])         // compute lowercase key only once per item
  .filter(([key, lowercaseKey]) => !actionFunctions[lowercaseKey])  // filter out instructions with already defined actions
  .forEach(([key, lowercaseKey]) => {
    let finalKey = reservedWords[lowercaseKey] || lowercaseKey
    actionFunctions[finalKey] = createDefaultAction(finalKey, Instruction[key]);
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
