import { byteLength, leftPad, POINTER_BYTE_LENGTH, rightPad, translateToBytecode } from "./helpers";
import { ActionIdToCodeLocation, ExecutedCodeContext } from "./index";
import os from "os";

export type StackDelta = [number, number];

export abstract class Hexable {
  abstract toHex(executedCodeContext:ExecutedCodeContext, codeLocations:ActionIdToCodeLocation):string;
  abstract byteLength():number;

  stackDelta():StackDelta {
    // Not everything hexable is something that affects the stack.
    // We'll add a default value here that objects can override.
    return [0,0];
  }
}

export class Instruction extends Hexable {
  static STOP = new Instruction(0x00, 0, 0);
  static ADD = new Instruction(0x01, 2, 1);
  static MUL = new Instruction(0x02, 2, 1);
  static SUB = new Instruction(0x03, 2, 1);
  static DIV = new Instruction(0x04, 2, 1);
  static SDIV = new Instruction(0x05, 2, 1);
  static MOD = new Instruction(0x06, 2, 1);
  static SMOD = new Instruction(0x07, 2, 1);
  static ADDMOD = new Instruction(0x08, 3, 1);
  static MULMOD = new Instruction(0x09, 3, 1);
  static EXP = new Instruction(0x0A, 2, 1);
  static SIGNEXTEND = new Instruction(0x0B, 2, 1);

  static LT = new Instruction(0x10, 2, 1);
  static GT = new Instruction(0x11, 2, 1);
  static SLT = new Instruction(0x12, 2, 1);
  static SGT = new Instruction(0x13, 2, 1);
  static EQ = new Instruction(0x14, 2, 1);
  static ISZERO = new Instruction(0x15, 1, 1);
  static AND = new Instruction(0x16, 2, 1);
  static OR = new Instruction(0x17, 2, 1);
  static XOR = new Instruction(0x18, 2, 1);
  static NOT = new Instruction(0x19, 1, 1);

  static BYTE = new Instruction(0x1A, 2, 1);

  static SHL = new Instruction(0x1B, 2, 1);
  static SHR = new Instruction(0x1C, 2, 1);
  static SAR = new Instruction(0x1D, 2, 1);

  static SHA3 = new Instruction(0x20, 2, 1);

  static ADDRESS = new Instruction(0x30, 0, 1);
  static BALANCE = new Instruction(0x31, 1, 1);
  static ORIGIN = new Instruction(0x32, 0, 1);
  static CALLER = new Instruction(0x33, 0, 1);
  static CALLVALUE = new Instruction(0x34, 0, 1);
  static CALLDATALOAD = new Instruction(0x35, 1, 1);
  static CALLDATASIZE = new Instruction(0x36, 0, 1);
  static CALLDATACOPY = new Instruction(0x37, 3, 0);
  static CODESIZE = new Instruction(0x38, 0, 1);
  static CODECOPY = new Instruction(0x39, 3, 0);
  static GASPRICE = new Instruction(0x3A, 0, 1);
  static EXTCODESIZE = new Instruction(0x3B, 1, 1);
  static EXTCODECOPY = new Instruction(0x3C, 4, 0);
  static RETURNDATASIZE = new Instruction(0x3D, 0, 1);
  static RETURNDATACOPY = new Instruction(0x3E, 3, 0);
  static EXTCODEHASH = new Instruction(0x3F, 1, 1);
  static BLOCKHASH = new Instruction(0x40, 1, 1);
  static COINBASE = new Instruction(0x41, 0, 1);
  static TIMESTAMP = new Instruction(0x42, 0, 1);
  static NUMBER = new Instruction(0x43, 0, 1);
  static DIFFICULTY = new Instruction(0x44, 0, 1);
  static GASLIMIT = new Instruction(0x45, 0, 1);
  static CHAINID = new Instruction(0x46, 0, 1);
  static SELFBALANCE = new Instruction(0x47, 0, 1);
  static BASEFEE = new Instruction(0x48, 0, 1);

  static POP = new Instruction(0x50, 1, 0);
  static MLOAD = new Instruction(0x51, 1, 1);
  static MSTORE = new Instruction(0x52, 2, 0);
  static MSTORE8 = new Instruction(0x53, 2, 0);
  static SLOAD = new Instruction(0x54, 1, 1);
  static SSTORE = new Instruction(0x55, 2, 1);
  static JUMP = new Instruction(0x56, 1, 0);
  static JUMPI = new Instruction(0x57, 2, 0);
  static PC = new Instruction(0x58, 0, 1);
  static MSIZE = new Instruction(0x59, 0, 1);
  static GAS = new Instruction(0x5A, 0, 1);
  static JUMPDEST = new Instruction(0x5B, 0, 0);

  static PUSH1 = new Instruction(0x60, 0, 1);
  static PUSH2 = new Instruction(0x61, 0, 1);
  static PUSH3 = new Instruction(0x62, 0, 1);
  static PUSH4 = new Instruction(0x63, 0, 1);
  static PUSH5 = new Instruction(0x64, 0, 1);
  static PUSH6 = new Instruction(0x65, 0, 1);
  static PUSH7 = new Instruction(0x66, 0, 1);
  static PUSH8 = new Instruction(0x67, 0, 1);
  static PUSH9 = new Instruction(0x68, 0, 1);
  static PUSH10 = new Instruction(0x69, 0, 1);
  static PUSH11 = new Instruction(0x6A, 0, 1);
  static PUSH12 = new Instruction(0x6B, 0, 1);
  static PUSH13 = new Instruction(0x6C, 0, 1);
  static PUSH14 = new Instruction(0x6D, 0, 1);
  static PUSH15 = new Instruction(0x6E, 0, 1);
  static PUSH16 = new Instruction(0x6F, 0, 1);
  static PUSH17 = new Instruction(0x70, 0, 1);
  static PUSH18 = new Instruction(0x71, 0, 1);
  static PUSH19 = new Instruction(0x72, 0, 1);
  static PUSH20 = new Instruction(0x73, 0, 1);
  static PUSH21 = new Instruction(0x74, 0, 1);
  static PUSH22 = new Instruction(0x75, 0, 1);
  static PUSH23 = new Instruction(0x76, 0, 1);
  static PUSH24 = new Instruction(0x77, 0, 1);
  static PUSH25 = new Instruction(0x78, 0, 1);
  static PUSH26 = new Instruction(0x79, 0, 1);
  static PUSH27 = new Instruction(0x7A, 0, 1);
  static PUSH28 = new Instruction(0x7B, 0, 1);
  static PUSH29 = new Instruction(0x7C, 0, 1);
  static PUSH30 = new Instruction(0x7D, 0, 1);
  static PUSH31 = new Instruction(0x7E, 0, 1);
  static PUSH32 = new Instruction(0x7F, 0, 1);

  static DUP1 = new Instruction(0x80, 0, 1);
  static DUP2 = new Instruction(0x81, 0, 1);
  static DUP3 = new Instruction(0x82, 0, 1);
  static DUP4 = new Instruction(0x83, 0, 1);
  static DUP5 = new Instruction(0x84, 0, 1);
  static DUP6 = new Instruction(0x85, 0, 1);
  static DUP7 = new Instruction(0x86, 0, 1);
  static DUP8 = new Instruction(0x87, 0, 1);
  static DUP9 = new Instruction(0x88, 0, 1);
  static DUP10 = new Instruction(0x89, 0, 1);
  static DUP11 = new Instruction(0x8A, 0, 1);
  static DUP12 = new Instruction(0x8B, 0, 1);
  static DUP13 = new Instruction(0x8C, 0, 1);
  static DUP14 = new Instruction(0x8D, 0, 1);
  static DUP15 = new Instruction(0x8E, 0, 1);
  static DUP16 = new Instruction(0x8F, 0, 1);

  static SWAP1 = new Instruction(0x90, 0, 0);
  static SWAP2 = new Instruction(0x91, 0, 0);
  static SWAP3 = new Instruction(0x92, 0, 0);
  static SWAP4 = new Instruction(0x93, 0, 0);
  static SWAP5 = new Instruction(0x94, 0, 0);
  static SWAP6 = new Instruction(0x95, 0, 0);
  static SWAP7 = new Instruction(0x96, 0, 0);
  static SWAP8 = new Instruction(0x97, 0, 0);
  static SWAP9 = new Instruction(0x98, 0, 0);
  static SWAP10 = new Instruction(0x99, 0, 0);
  static SWAP11 = new Instruction(0x9A, 0, 0);
  static SWAP12 = new Instruction(0x9B, 0, 0);
  static SWAP13 = new Instruction(0x9C, 0, 0);
  static SWAP14 = new Instruction(0x9D, 0, 0);
  static SWAP15 = new Instruction(0x9E, 0, 0);
  static SWAP16 = new Instruction(0x9F, 0, 0);
  
  static LOG0 = new Instruction(0xA0, 2, 0);
  static LOG1 = new Instruction(0xA1, 3, 0);
  static LOG2 = new Instruction(0xA2, 4, 0);
  static LOG3 = new Instruction(0xA3, 5, 0);
  static LOG4 = new Instruction(0xA4, 6, 0);

  static CREATE = new Instruction(0xF0, 3, 1);
  static CALL = new Instruction(0xF1, 7, 1);
  static CALLCODE = new Instruction(0xF2, 7, 0);
  static RETURN = new Instruction(0xF3, 2, 0);
  static DELEGATECALL = new Instruction(0xF4, 6, 0);
  static CREATE2 = new Instruction(0xF5, 4, 0);

  static STATICCALL = new Instruction(0xFA, 6, 0);

  static REVERT = new Instruction(0xFD, 2, 0);

  static SELFDESTRUCT = new Instruction(0xFF, 1, 0);


  code:number;
  stackRemoved:number;
  stackAdded:number; 

  constructor(code:number, stackRemoved:number = 0, stackAdded:number = 0) {
    super()
    this.code = code;
    this.stackRemoved = stackRemoved;
    this.stackAdded = stackAdded;
  }

  stackDelta():StackDelta {
    return [this.stackRemoved, this.stackAdded];
  }

  byteLength() {
    return 1;
  }

  toHex(executedCodeContext:ExecutedCodeContext={}, codeLocations:ActionIdToCodeLocation={}) {
    return BigInt(this.code).toString(16)
  }

  isSwap() {
    return this.code >= Instruction.SWAP1.code && this.code <= Instruction.SWAP16.code
  }
}

export enum SolidityTypes {
  uint = "uint",
  bytes = "bytes",
  string = "string"
}

export enum ConfigKeys {
  deployable = "deployable"
}

export type HexLiteral = BigInt|number;
export type HexableValue = Hexable|HexLiteral|Instruction;
export type Expression = HexableValue|ConfigKeys|number|boolean|string|object; 

export type ActionParameter = HexableValue|RelativeStackReference;

export type IntermediateRepresentation = Action|HexableValue;

export class RelativeStackReference extends Hexable {
  static nextId = 0;

  id:number;
  action:Action;
  index:number;

  constructor(action:Action, index:number) {
    super(); 
    this.action = action;
    this.index = index;
    this.id = RelativeStackReference.nextId;
    RelativeStackReference.nextId += 1;
  }

  // Not sure if the following are needed; here as a guard.
  toHex(executedCodeContext:ExecutedCodeContext, codeLocations:ActionIdToCodeLocation):string {
    throw new Error("FATAL ERROR: Attempting to convert raw relative stack reference to hex. Should have been previously converted/replaced with a proper StackReference class.");
  }

  byteLength():number {
    return 1; // This will ultimately be replaced by a DUP.   
  }

  stackDelta():StackDelta {
    throw new Error("FATAL ERROR: Attempting to get the stack delta of a raw stack reference. Should have been previously converted/replaced with a proper StackReference class.");
  }

  getReplacement(depth:number):Instruction {
    throw new Error("FATAL ERROR: Attempting to replace a raw relative stack reference. Should have been previously converted/replaced with a proper StackReference class.");
  }
}

export class DupStackReference extends RelativeStackReference {
  constructor(action:Action, index:number) {
    super(action, index);
  } 

  getReplacement(depth:number):Instruction {
    // We add one because DUP1 is the top (index 0)
    let dupNumber = depth + 1;
    let instruction = Instruction["DUP" + dupNumber];

    if (typeof instruction == "undefined") {
      throw new Error("Stack reference from " + this.action.name + "() is too deep; cannot use DUP. Please make sure the stack reference is within 16 slots from the top of the stack."); 
    }

    return instruction;
  }

  stackDelta():StackDelta {
    // Use DUP1 as all DUP's have the same stack effects
    return Instruction.DUP1.stackDelta();
  }

  static from(relativeStackReference:RelativeStackReference) {
    return new DupStackReference(relativeStackReference.action, relativeStackReference.index);
  }
}

export class SwapStackReference extends RelativeStackReference {
  constructor(action:Action, index:number) {
    super(action, index);
  } 

  getReplacement(depth:number):Instruction {
    // Note that unlike DupStackReference, we don't add 1 here
    // because N in SwapN always matches the 0-based index (depth)
    // of the value being swapped. 
    let instruction = Instruction["SWAP" + depth];

    if (typeof instruction == "undefined") {
      throw new Error("Stack reference from " + this.action.name + "() is too deep; cannot use SWAP. Please make sure the stack reference is within 16 slots from the top of the stack."); 
    }

    return instruction;
  }

  stackDelta():StackDelta {
    // Use SWAP1 as all SWAP's have the same stack effects
    return Instruction.SWAP1.stackDelta();
  }

  static from(relativeStackReference:RelativeStackReference) {
    return new SwapStackReference(relativeStackReference.action, relativeStackReference.index);
  }
}

// Here to signal to the preprocessor not to swap the stack references
// during the swap action. 
export class HotSwapStackReference extends SwapStackReference {
  static from(relativeStackReference:RelativeStackReference) {
    return new HotSwapStackReference(relativeStackReference.action, relativeStackReference.index);
  }
}

export class StackReference extends Hexable {
  static nextIndex = 0;

  id:number;

  constructor() {
    super();
    this.id = StackReference.nextIndex;
    StackReference.nextIndex += 1;
  }

  // Not sure if the following are needed; here as a guard.
  toHex(executedCodeContext:ExecutedCodeContext, codeLocations:ActionIdToCodeLocation):string {
    throw new Error("FATAL ERROR: Attempting to convert raw stack reference to hex. Should have been previously converted/replaced with an Instruction or proper StackReference class.");
  }

  stackDelta():StackDelta {
    throw new Error("FATAL ERROR: Attempting to get the stack delta of a raw stack reference. Should have been previously converted/replaced with an Instruction or proper StackReference class.");
  }

  byteLength():number {
    throw new Error("FATAL ERROR: Stack references should never have their length evaluated. If so, it means they haven't been replaced properly.");
  }
}

// We're doing something *very* fancy here, all in the name
// of syntactic sugar for users. This action is an array.
// When a user writes [val1, val2, ...] = action, they'll
// get stack references. 
export class Action extends Hexable {
  static nextId:number = 0;

  name:string;
  id:number; 
  parentAction:Action;
  intermediate:IntermediateRepresentation[];
  stack:RelativeStackReference[];
  pointer:ActionPointer;
  isJumpDestination:boolean = false;

  // This is used to figure out the line and column location
  // from the calling script. It's a slightly hacky way of 
  // determining which actions were run first and are not meant 
  // to be children. 
  prunedError:PrunedError;

  constructor(name:string) {
    super();
    this.name = name;
    this.id = Action.nextId;
    this.intermediate = [];
    
    // Fill the stack up with relative stack references.
    // We assume here that no human is going to have stack references
    // more than 16 values deep. If so, we may need to change the
    // algo here. 
    this.stack = new Array(16).fill(0).map((val, index) => new RelativeStackReference(this, index));

    Action.nextId += 1;

    this.prunedError = new PrunedError();
  }

  setIsJumpDestination() {
    this.isJumpDestination = true;
  }

  stackDelta():StackDelta {
    let totalRemoved = 0;
    let totalAdded = 0;
    
    this.intermediate
      .filter((item) => item instanceof Hexable)
      .forEach((item:Hexable) => {
        let [removed, added] = item.stackDelta();
        totalRemoved += removed;
        totalAdded += added;
      })

    return [totalRemoved, totalAdded];
  }

  getPointer() {
    if (!this.pointer) {
      this.pointer = new ActionPointer(this);
    }
    return this.pointer;
  }

  push(...items:IntermediateRepresentation[]) {
    items.forEach((item) => {
      if (item instanceof Action) {
        if (item.parentAction != null) {
          throw new Error("FATAL ERROR: " + item.toString() + " is already the child of another action!");
        }  

        if (!this.isElligableParentOf(item)) {
          throw new Error("Attempting to pass previously executed action to " + this.name + "(). This may be an error with your code; or it may be an issue with evmscript. Please evaluate your code to determine if any preprocessing variables -- like loop labels -- are being passed inappropriately to " + this.name + "(). When in doubt, use $ptr('label') to jump.")
        }
        item.parentAction = this;
      }
    })
    this.intermediate.push(...items);
  }

  // Somewhat of a hack. The isElligibleParentOf() function
  // is meant to catch ellibility for when actions are composed.
  // However, there are a few exceptions where this doesn't work
  // (e.g., method()'s that call previously defined macros).
  // forcePush works around it by skipping those checks. 
  // Use with caution. 
  //
  // TODO: Are we losing important error checking here? 
  forcePush(...items:IntermediateRepresentation[]) {
    items.forEach((item) => {
      if (item instanceof Action) {
        item.parentAction = this;
      }
    })
    this.intermediate.push(...items);
  }

  isElligableParentOf(other:Action) {
    let [thisLine, thisColumn] = this.originalLineAndColumn();
    let [otherLine, otherColumn] = other.originalLineAndColumn();
    
    if (thisLine < otherLine) {
      return true;
    } else if (thisLine > otherLine) {
      return false;
    }

    if (thisColumn <= otherColumn) {
      return true;
    } 

    return false;
  }

  toHex(executedCodeContext:ExecutedCodeContext, codeLocations:ActionIdToCodeLocation):string { 
    let hex = this.intermediate
      .map((item) => translateToBytecode(item, executedCodeContext, codeLocations))
      .join("");

    if (this.isJumpDestination) {
      hex = Instruction.JUMPDEST.toHex() + hex;
    }

    return hex;
  }

  byteLength() {
    let length = this.intermediate
      .map((item) => byteLength(item))
      .reduce((a, b) => a + b, 0)

    if (this.isJumpDestination) {
      length += Instruction.JUMPDEST.byteLength();
    }

    return length;
  }

  toString() {
    return "Action[name=" + this.name + ", id=" + this.id + "]";
  }

  originalLineAndColumn() {
    return this.prunedError.originalLineAndColumn();
  }
}

// TailAction signals to the processor that this action
// should be applied to the end of the intermediate representation
export class TailAction extends Action {
  toString() {
    return "TailAction(" + this.name + "):" + this.id;
  }
}

export class LabelPointer extends Hexable {
  labelName = "";

  constructor(labelName:string) {
    super();
    this.labelName = labelName;
  }

  toHex(executedCodeContext:ExecutedCodeContext, codeLocations:ActionIdToCodeLocation):string {
    let actionPointer = executedCodeContext[this.labelName];

    if (!actionPointer || !(actionPointer instanceof ActionPointer)) {
      throw new Error("Unknown label pointer '" + this.labelName + "' or label set incorrectly. Make sure to always set variables to the result of an action function (a function that *doesn't* start with $).");
    }
    
    return actionPointer.toHex(executedCodeContext, codeLocations);
  }

  byteLength() {
    return POINTER_BYTE_LENGTH;
  }
}


export class ActionPointer extends Hexable {
  action:Action;
  constructor(action:Action) {
    super();
    this.action = action;
  }

  toHex(executedCodeContext:ExecutedCodeContext, codeLocations:ActionIdToCodeLocation):string { 
    return leftPad(
      codeLocations[this.action.id].toString(16),
      POINTER_BYTE_LENGTH
    );
  }

  byteLength() {
    return POINTER_BYTE_LENGTH;
  }

  [Symbol.iterator]() {
    // Use a new index for each iterator. This makes multiple
    // iterations over the iterable safe for non-trivial cases,
    // such as use of break or nested looping over the same iterable.
    let index = 0;

    return {
      next: () => {
        if (index < this.action.stack.length) {
          return {value: this.action.stack[index++], done: false}
        } else {
          return {done: true}
        }
      }
    }
  }
}

export class ConcatedHexValue extends Hexable {
  items:HexableValue[] = [];

  constructor(...items:HexableValue[]) {
    super();
    this.items = items;
  }

  toHex(executedCodeContext:ExecutedCodeContext, codeLocations:ActionIdToCodeLocation):string {
    let bytecode = this.items
      .map<string>((item) => translateToBytecode(item, executedCodeContext, codeLocations))
      .join("");

    return bytecode;
  }

  byteLength() {
    let length = 0;
    this.items.forEach((item) => {
      length += byteLength(item)
    });
    return length;
  }
}
export class ByteRange extends Hexable {
  item:HexableValue;
  startPositionInBytes:number;
  lengthInBytes:number;

  constructor(item:HexableValue, startPositionInBytes:number = 0, lengthInBytes:number = 2) {
    super();

    let actualByteLength = byteLength(item);

    if (startPositionInBytes > actualByteLength) {
      throw new Error(`ByteRange start position longer than input. Received: ${startPositionInBytes}, Actual bytes: ${actualByteLength}`)
    }

    this.item = item;
    this.startPositionInBytes = startPositionInBytes;
    this.lengthInBytes = lengthInBytes;
  }

  toHex(executedCodeContext:ExecutedCodeContext, codeLocations:ActionIdToCodeLocation):string {
    // This is naive, and will convert the item to hex multiple 
    // times if other ranges exist over the same data. That's fine for now. 
    let bytecode = translateToBytecode(this.item, executedCodeContext, codeLocations);
    let chunk = bytecode.substr(this.startPositionInBytes * 2, this.lengthInBytes * 2);
    return rightPad(chunk, this.lengthInBytes);
  }

  byteLength() {
    return this.lengthInBytes;
  }
}

export class WordRange extends ByteRange {
  constructor(item:HexableValue, startPositionInWords:number = 0, lengthInWords:number = 1) {
    let actualByteLength = byteLength(item);

    let startPositionInBytes = startPositionInWords * 32;
    let lengthInBytes = lengthInWords * 32;

    if (startPositionInBytes > actualByteLength) {
      throw new Error(`WordRange start position longer than input. Received: ${startPositionInWords}, Actual words: ${startPositionInWords % 32 != 0 ? "<" : ""}${Math.ceil(startPositionInWords / 32)}`)
    }

    super(item, startPositionInBytes, lengthInBytes);
  }
}

export class Padded extends Hexable {
  item:HexableValue;
  itemLength:number;
  lengthInBytes:number;
  side:("left"|"right");

  constructor(item:HexableValue, lengthInBytes: number, side:("left"|"right") = "left") {
    super();
    this.item = item;
    this.itemLength = byteLength(item);
    this.lengthInBytes = lengthInBytes;
    this.side = side;
  }

  toHex(executedCodeContext:ExecutedCodeContext, codeLocations:ActionIdToCodeLocation) {
    let bytecode = translateToBytecode(this.item, executedCodeContext, codeLocations);

    if (this.side == "left") {
      return leftPad(bytecode, this.lengthInBytes)
    } else {
      return rightPad(bytecode, this.lengthInBytes);
    }
  }

  byteLength() {
    return this.itemLength + (this.lengthInBytes - (this.itemLength % this.lengthInBytes));
  }
}

export class SolidityString extends Hexable {
  str:HexableValue;
  length = 0;

  constructor(str:HexableValue) {
    super();
    this.str = str;
    this.length = byteLength(str);
  }

  toHex(executedCodeContext:ExecutedCodeContext, codeLocations:ActionIdToCodeLocation) {
    let value = new ConcatedHexValue(
      new Padded(this.length, 32),
      new Padded(this.str, 32, "right")
    )
    
    return value.toHex(executedCodeContext, codeLocations);
  }

  byteLength() {
    return 32 + (this.length + (32 - this.length % 32));
  }
}

export class JumpMap extends Hexable {
  items:ConcatedHexValue;

  constructor(...items:string[]) {
    super();
    this.items = new ConcatedHexValue(...items.map((str) => new LabelPointer(str)));
  }

  toHex(executedCodeContext:ExecutedCodeContext, codeLocations:ActionIdToCodeLocation):string {
    return rightPad(
      this.items.toHex(executedCodeContext, codeLocations),
      32
    )
  }

  byteLength() {
    let length = this.items.byteLength();
    return length + (32 - (length % 32));
  }
}

export class PrunedError extends Error {
  constructor(message?:string) {
    super(message);

    // Set the prototype explicitly. Quirk with extending the Error class.
    // See here: https://stackoverflow.com/questions/41102060/typescript-extending-error-class
    Object.setPrototypeOf(this, PrunedError.prototype);

    this.pruneStack();
  }

  pruneStack() {
    let stackLines = this.stack.split(/\r?\n/);
    let found = false;

    this.stack = stackLines.filter((line) => {
      // Note: The [evmscript] suffix is added by the vm during processing.
      // Errors created outside of a script execution won't include it. 
      if (!found && line.indexOf("[evmscript]") >= 0) {
        found = true;
        return true;
      }
      return !found;
    }).join(os.EOL)
  }

  originalLineAndColumn():[number, number] {
    // Example line: 
    // 
    //   at bytecode [evmscript]:4:11
    //
    // 1) split lines, then 2) get the last line (e.g., reverse and get the first),
    // then 3) split the last line based on colons, 4) parseInt() and remove non-numbers

    let [line, column] = this.stack.split(/\r?\n/).reverse()[0].split(":")
      .map<number>((str) => parseInt(str))
      .filter((num) => !isNaN(num))

    return [line, column];
  }

  static from(error:Error) {
    let pruned = new PrunedError(error.message);
    pruned.name = error.name;
    pruned.stack = error.stack;
    pruned.pruneStack();
    return pruned;
  }
}

export function sanitizeHexStrings(input:Expression|HexableValue, functionName:string):Expression {
  if (typeof input == "string" && input.indexOf("0x") == 0) {
    return BigInt(input);
  }

  return input;
}