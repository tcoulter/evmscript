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

// This isn't realllllly an expression function, since we return a noop. 
// TODO: Fix this so that we can return void and have it still be okay.
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

export const actionFunctions:Record<string, ActionFunction> = {
  push,
  getmem,
  goto
}

export const expressionFunctions:Record<string, ExpressionFunction> = {
  $concat,
  $ptr
}

export const contextFunctions:Record<string, ContextFunction> = {
  $set
}
