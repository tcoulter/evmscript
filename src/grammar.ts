import { number, string } from "yargs";
import { byteLength, leftPad, POINTER_BYTE_LENGTH, rightPad, translateToBytecode } from "./helpers";
import { ActionIndexToCodeLocation, ExecutedCodeContext, RuntimeContext } from ".";

export enum Instruction {
  STOP = 0x00,

  ADD = 0x01,
  MUL = 0x02,
  SUB = 0x03,
  DIV = 0x04,
  SDIV = 0x05,
  MOD = 0x06,
  SMOD = 0x07,
  ADDMOD = 0x08,
  MULMOD = 0x09,
  EXP = 0x0A,
  SIGNEXTEND = 0x0B,

  LT = 0x10,
  GT = 0x11,
  SLT = 0x12,
  SGT = 0x13,
  EQ = 0x14,
  ISZERO = 0x15,
  AND = 0x16,
  OR = 0x17,
  XOR = 0x18,
  NOT = 0x19,

  BYTE = 0x1A,

  SHL = 0x1B,
  SHR = 0x1C,
  SAR = 0x1D,

  SHA3 = 0x20,

  ADDRESS = 0x30,
  BALANCE = 0x31,
  ORIGIN = 0x32,
  CALLER = 0x33,
  CALLVALUE = 0x34,
  CALLDATALOAD = 0x35,
  CALLDATASIZE = 0x36,
  CALLDATACOPY = 0x37,
  CODESIZE = 0x38,
  CODECOPY = 0x39,
  GASPRICE = 0x3A,
  EXTCODESIZE = 0x3B,
  EXTCODECOPY = 0x3C,
  RETURNDATASIZE = 0x3D,
  RETURNDATACOPY = 0x3E,
  EXTCODEHASH = 0x3F,
  BLOCKHASH = 0x40,
  COINBASE = 0x41,
  TIMESTAMP = 0x42,
  NUMBER = 0x43,
  DIFFICULTY = 0x44,
  GASLIMIT = 0x45,
  CHAINID = 0x46,
  SELFBALANCE = 0x47,
  BASEFEE = 0x48,

  POP = 0x50,
  MLOAD = 0x51,
  MSTORE = 0x52,
  MSTORE8 = 0x53,
  SLOAD = 0x54,
  SSTORE = 0x55,
  JUMP = 0x56,
  JUMPI = 0x57,
  PC = 0x58,
  MSIZE = 0x59,
  GAS = 0x5A,
  JUMPDEST = 0x5B,

  PUSH1 = 0x60,
  PUSH2 = 0x61,
  PUSH3 = 0x62,
  PUSH4 = 0x63,
  PUSH5 = 0x64,
  PUSH6 = 0x65,
  PUSH7 = 0x66,
  PUSH8 = 0x67,
  PUSH9 = 0x68,
  PUSH10 = 0x69,
  PUSH11 = 0x6A,
  PUSH12 = 0x6B,
  PUSH13 = 0x6C,
  PUSH14 = 0x6D,
  PUSH15 = 0x6E,
  PUSH16 = 0x6F,
  PUSH17 = 0x70,
  PUSH18 = 0x71,
  PUSH19 = 0x72,
  PUSH20 = 0x73,
  PUSH21 = 0x74,
  PUSH22 = 0x75,
  PUSH23 = 0x76,
  PUSH24 = 0x77,
  PUSH25 = 0x78,
  PUSH26 = 0x79,
  PUSH27 = 0x7A,
  PUSH28 = 0x7B,
  PUSH29 = 0x7C,
  PUSH30 = 0x7D,
  PUSH31 = 0x7E,
  PUSH32 = 0x7F,

  DUP1 = 0x80,
  DUP2 = 0x81,
  DUP3 = 0x82,
  DUP4 = 0x83,
  DUP5 = 0x84,
  DUP6 = 0x85,
  DUP7 = 0x86,
  DUP8 = 0x87,
  DUP9 = 0x88,
  DUP10 = 0x89,
  DUP11 = 0x8A,
  DUP12 = 0x8B,
  DUP13 = 0x8C,
  DUP14 = 0x8D,
  DUP15 = 0x8E,
  DUP16 = 0x8F,

  SWAP1 = 0x90,
  SWAP2 = 0x91,
  SWAP3 = 0x92,
  SWAP4 = 0x93,
  SWAP5 = 0x94,
  SWAP6 = 0x95,
  SWAP7 = 0x96,
  SWAP8 = 0x97,
  SWAP9 = 0x98,
  SWAP10 = 0x99,
  SWAP11 = 0x9A,
  SWAP12 = 0x9B,
  SWAP13 = 0x9C,
  SWAP14 = 0x9D,
  SWAP15 = 0x9E,
  SWAP16 = 0x9F,
  
  LOG0 = 0xA0,
  LOG1 = 0xA1,
  LOG2 = 0xA2,
  LOG3 = 0xA3,
  LOG4 = 0xA4,

  CREATE = 0xF0,
  CALL = 0xF1,
  CALLCODE = 0xF2,
  RETURN = 0xF3,
  DELEGATECALL = 0xF4,
  CREATE2 = 0xF5,

  STATICCALL = 0xFA,

  REVERT = 0xFD,

  SELFDESTRUCT = 0xFF
}

export enum ConfigKeys {
  deployable = "deployable"
}

export abstract class Hexable {
  abstract toHex(executedCodeContext:ExecutedCodeContext, codeLocations:ActionIndexToCodeLocation):string;
  abstract byteLength():number;
}

export type HexLiteral = BigInt;
export type HexableValue = Hexable|HexLiteral|Instruction;
export type Expression = HexableValue|ConfigKeys|number|boolean|string; 

export type IntermediateRepresentation = ActionSource|HexableValue;

// Mostly for typing.
export class LabelPointer extends Hexable {
  labelName = "";

  constructor(labelName:string) {
    super();
    this.labelName = labelName;
  }

  toHex(executedCodeContext:ExecutedCodeContext, codeLocations:ActionIndexToCodeLocation):string {
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
  actionSource:ActionSource;

  constructor(actionSource:ActionSource) {
    super();
    this.actionSource = actionSource;
  }

  toHex(executedCodeContext:ExecutedCodeContext, codeLocations:ActionIndexToCodeLocation):string { 
    return leftPad(
      codeLocations[this.actionSource.actionIndex].toString(16),
      POINTER_BYTE_LENGTH
    );
  }

  byteLength() {
    return POINTER_BYTE_LENGTH;
  }
}

export class ActionSource extends Hexable {
  actionIndex = 0;
  isJumpDestination = false;

  constructor(actionIndex:number) {
    super();
    this.actionIndex = actionIndex;
  }

  getPointer() {
    return new ActionPointer(this);
  }

  toHex(executedCodeContext:ExecutedCodeContext, codeLocations:ActionIndexToCodeLocation):string { 
    if (this.isJumpDestination) {
      return translateToBytecode(Instruction.JUMPDEST, executedCodeContext, codeLocations);
    }

    return "";
  }

  byteLength() {
    return this.isJumpDestination ? 1 /*JUMPDEST*/ : 0; 
  }

  setIsJumpDestination() {
    this.isJumpDestination = true;
  }
}

export class ConcatedHexValue extends Hexable {
  items:HexableValue[] = [];

  constructor(...items:HexableValue[]) {
    super();
    this.items = items;
  }

  toHex(executedCodeContext:ExecutedCodeContext, codeLocations:ActionIndexToCodeLocation):string {
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

  toHex(executedCodeContext:ExecutedCodeContext, codeLocations:ActionIndexToCodeLocation):string {
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

  toHex(executedCodeContext:ExecutedCodeContext, codeLocations:ActionIndexToCodeLocation) {
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

  toHex(executedCodeContext:ExecutedCodeContext, codeLocations:ActionIndexToCodeLocation) {
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

  toHex(executedCodeContext:ExecutedCodeContext, codeLocations:ActionIndexToCodeLocation):string {
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

export function sanitize(input:Expression|HexableValue, functionName:string):Expression {
  if (typeof input == "string") {
    if (input.indexOf("0x") == 0) {
      return BigInt(input);
    } else {
      return input;
    }
  }

  if (input instanceof Hexable 
    || typeof input == "number"
    || typeof input == "bigint" 
    || typeof input == "boolean") {
    return input;
  }

  throw new Error("Function " + functionName + "() cannot accept value of: " + input + ". If you're jumping to a named code location with jump(), use jump($ptr('name')).");
}