import { ActionFunction, ContextFunction, ExpressionFunction } from "./actions";
import {ActionPointer, ActionSource, ConcatedHexValue, Expression, Hexable, HexableValue, IntermediateRepresentation, LabelPointer, sanitize} from "./grammar";
import { ActionIndexToJumpDest, ExecutedCodeContext, RuntimeContext } from ".";

export type UserFacingFunction = (...args: Expression[]) => Expression|ActionPointer;


export const POINTER_BYTE_LENGTH = 2;

export function byteLength(input:IntermediateRepresentation):number {
  if (input instanceof Hexable) {
    return input.byteLength();
  }

  if (typeof input == "number") {
    input = BigInt(input);
    // Don't return; let next block take care of it.
  }

  if (typeof input == "bigint") { 
    let length = input.toString(16).length;
    return Math.floor(length / 2) + (length % 2);
  }

  throw new Error("Unknown input to byteLength(): " + input);
}

export function createActionHandler(runtimeContext:RuntimeContext, key:string, fn:ActionFunction):UserFacingFunction {
  let handler:UserFacingFunction = function(...args:Expression[]) {
    let actionSource:ActionSource = runtimeContext.getActionSource();
    let actionPointer:ActionPointer = actionSource.getPointer();

    runtimeContext.intermediate.push(actionSource);

    args = args.map((input:Expression) => sanitize(input, key, true));
    fn.apply(null, [runtimeContext, ...args]); 

    return actionPointer;
  }

  return handler;
}

export function createExpressionAndContextHandlers(runtimeContext:RuntimeContext, key:string, fn:ExpressionFunction|ContextFunction):UserFacingFunction {
  // Note that Expression has the largest surface area of available types,
  // so it applies to all function types.
  let handler:UserFacingFunction = function(...args:Expression[]) {
    args = args.map((input:Expression) => sanitize(input, key, false));
    return fn.apply(null, [runtimeContext, ...args]);
  }

  return handler;
}

export function translateToBytecode(item:IntermediateRepresentation, executedCodeContext:ExecutedCodeContext, jumpDestinations:ActionIndexToJumpDest):string {
  let bytecode = "";

  if (item instanceof Hexable) {
    bytecode = item.toHex(executedCodeContext, jumpDestinations);
  } else {
    bytecode = item.toString(16);
  }

  return ensureFullByte(bytecode);
}

export function leftPad(bytecode:string, byteLength:number) {
  while (bytecode.length < byteLength * 2) {
    bytecode = "0" + bytecode;
  }

  return bytecode;
}

export function ensureFullByte(bytecode:string) {
  while (bytecode.length % 2 != 0) {
    bytecode = "0" + bytecode;
  }

  return bytecode
}