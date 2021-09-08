import expect from "expect";
import { ByteRange, JumpMap, WordRange } from "../src/grammar";

describe('Grammar', () => {

  describe('JumpMap', () => {
    it("calculates the right bytelength based on padding (under one word)", () => {
      let jumpmap = new JumpMap(
        "one",
        "two", 
        "three"
      )

      let length = jumpmap.byteLength();

      expect(length).toBe(32);
    })

    it("calculates the right bytelength based on padding (over one word)", () => {
      let jumpmap = new JumpMap(
        "one",  // Each label pointer is 2 bytes
        "two", 
        "three",
        "four",
        "five", 
        "six", 
        "seven", 
        "eight", 
        "nine", 
        "ten", 
        "eleven",
        "twelve",
        "thirteen",
        "fourteen",
        "fifteen", 
        "sixteen",
        "seventeen", 
        "eighteen"
      )

      let length = jumpmap.byteLength();

      expect(length).toBe(64);
    })
  })

  describe("ByteRange & WordRange", () => {
    let hexData = BigInt("0xAA0102030405060708090A0B0C0D0E0F101112131415161718191A1B1C1D1E1F");

    it("should correctly cut up hex input based on start and length", () => {
      let byteRange = new ByteRange(hexData, 0, 5);
      let result = byteRange.toHex({}, {}) // hack; we know in this case those params won't be used.

      // Note: No 0x prefix comes from grammar objects
      expect(result).toBe(
        "AA01020304"
      )
    })

    it("right pads if length is larger than decoded data", () => {
      let byteRange = new ByteRange(hexData, 30, 5);
      let result = byteRange.toHex({}, {}) // hack; we know in this case those params won't be used.

      // Note: No 0x prefix comes from grammar objects
      expect(result).toBe(
        "1E1F000000"
      )
    })

    it("sets helpful defaults when using WordRange, also padding if length out of bounds", () => {
      let largeHexData = BigInt("0xAA0102030405060708090A0B0C0D0E0F101112131415161718191A1B1C1D1E1FAABBCCDDEEFF00112233445566778899");
    
      let wordRange = new WordRange(largeHexData, 1); // The second word
      let result = wordRange.toHex({}, {}) // hack; we know in this case those params won't be used.

      expect(result).toBe(
        "AABBCCDDEEFF0011223344556677889900000000000000000000000000000000"
      )
    })

    it("errors if the start is out of range", () => {
      expect(() => {
        new ByteRange(hexData, 1234, 5)
      }).toThrowError("Range start position longer than input. Received: 1234, Actual bytes: 32")

      expect(() => {
        new WordRange(hexData, 5)
      }).toThrowError("WordRange start position longer than input. Received: 5, Actual words: <1");
    })
  })
});