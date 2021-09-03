


import expect from "expect";
import { Matchers } from "expect/build/types";
import { ActionPointer, Hexable, HexableValue, LabelPointer, SolidityTypes } from "./grammar";
import { byteLength } from "./helpers";

interface ExtendedMatchers<R> extends Matchers<R> {
  isHexable(): R;
  is32BytesOrLess(): R;
  isSolidityType(): R;
  isOfType(type:string): R;
  isPointer(): R;
}

expect.extend({
  isHexable(input:any) {
    if (input instanceof Hexable
      || typeof input == "bigint"
      || typeof input == "number"
    ) {
      return {
        message: () =>
          `Expected input not to be a hexable value`,
        pass: true,
      }; 
    } else {
      return {
        message: () =>
          `Expected input to be a hexable value`,
        pass: false
      };
    }
  },

  is32BytesOrLess(input:HexableValue) {
    if (byteLength(input) <= 32) {
      return {
        message: () =>
          `Expected input not to be less than or equal to 32 bytes`,
        pass: true
      }
    } else {
      return {
        message: () =>
          `Expected input to be less than or equal to 32 bytes`,
        pass: false
      }
    }
  },

  isSolidityType(input:string) {
    let keysAsString = Object.keys(SolidityTypes).join(", ")

    if (!!SolidityTypes[input]) {
      return {
        message: () => 
          `Expected input not to be one of: ${keysAsString}`,
        pass: true
      }
    } else {
      return {
        message: () => 
          `Expected input to be one of: ${keysAsString}`,
        pass: false
      }
    }
  },

  isOfType(input:number, type:string) {
    if (typeof input == type) {
      return {
        message: () => `Expected input not to be of type: ${type}`,
        pass: true
      }
    } else {
      return {
        message: () => `Expected input to be of type: ${type}`,
        pass: false
      }
    }
  },

  isPointer(input:ActionPointer|LabelPointer) {
    if (input instanceof ActionPointer || input instanceof LabelPointer) {
      return {
        message: () => `Expected input not to be a code pointer`,
        pass: true
      }
    } else {
      return {
        message: () => `Expected input to be a code pointer`,
        pass: false
      }
    }
  }
})

export = function ensure<R>(actual:R):ExtendedMatchers<R> {
  return expect(actual) as ExtendedMatchers<R>;
};