import { ActionFunction, ContextFunction, ExpressionFunction } from "./actions";
import { Action, ActionPointer, Expression, Hexable, Instruction, IntermediateRepresentation, RelativeStackReference, sanitizeHexStrings, StackReference } from "./grammar";
import { ActionIdToCodeLocation, ExecutedCodeContext, RuntimeContext } from "./index";

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

    args = args.map((input:Expression) => sanitizeHexStrings(input, key));
    let action:Action = fn(...args); 

    runtimeContext.pushAction(action);
    
    return action.getPointer();
  }

  return handler;
}

export function createExpressionHandler(key:string, fn:ExpressionFunction):UserFacingFunction {
  // Note that Expression has the largest surface area of available types,
  // so it applies to all function types.
  let handler:UserFacingFunction = function(...args:Expression[]) {
    args = args.map((input:Expression) => sanitizeHexStrings(input, key));
    return fn.apply(null, [...args]);
  }

  return handler;
}


export function createContextHandler(runtimeContext:RuntimeContext, key:string, fn:ContextFunction):UserFacingFunction {
  // Note that Expression has the largest surface area of available types,
  // so it applies to all function types.
  let handler:UserFacingFunction = function(...args:Expression[]) {
    args = args.map((input:Expression) => sanitizeHexStrings(input, key));
    return fn.apply(null, [runtimeContext, ...args]);
  }

  return handler;
}

export function translateToBytecode(item:IntermediateRepresentation, executedCodeContext:ExecutedCodeContext, codeLocations:ActionIdToCodeLocation):string {
  let bytecode = "";

  if (item instanceof Hexable) {
    bytecode = item.toHex(executedCodeContext, codeLocations);
  } else {
    bytecode = item.toString(16);
  }

  return ensureFullByte(bytecode).toUpperCase();
}

export function leftPad(bytecode:string, byteLength:number) {
  while (bytecode.length % (byteLength * 2) != 0) {
    bytecode = "0" + bytecode;
  }

  return bytecode;
}

export function rightPad(bytecode:string, byteLength:number) {
  while (bytecode.length % (byteLength * 2) != 0) {
    bytecode = bytecode + "0";
  }

  return bytecode;
}

export function ensureFullByte(bytecode:string) {
  return leftPad(bytecode, 1);
}