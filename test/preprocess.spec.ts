import { defineReadOnly } from "ethers/lib/utils";
import expect from "expect";
import { preprocess } from "../src";


describe('General Processing', () => {
  it("prefixes output with 0x and capitalizes output", () => {
    let code = `
      push("0xff")
    `

    let bytecode = preprocess(code);

    expect(bytecode).toBe(
      "0x60FF"
    )
  })

  it("errors on Javscript syntax errors", () => {
    let code = `
      push("0xff"    // No closing paranthesis
    `

    expect(() => {
      preprocess(code);
    }).toThrow();
  })

  it("allows the user to specify extra context variables", () => {
    let code = `
      push(SOME_CONSTANT)
    `

    let bytecode = preprocess(code, {
      SOME_CONSTANT: 5
    });

    expect(bytecode).toBe(
      "0x6005"
    )
  })
})

describe('Action Functions', function() {
 
  describe("push (generalized push)", () => {
    it("should choose the right push instruction based on input", () => {
      let code = `
        push(0x11)
        push(0x1111)
        push(0x111111)
        // We'll assume that if it gets these three correct, it's good
        // Put for good measure, let's test the last one
        push("0x101112131415161718191A1B1C1D1E1F101112131415161718191A1B1C1D1E1F")  
      `
      let bytecode = preprocess(code);

      expect(bytecode).toBe(
        "0x6011611111621111117F101112131415161718191A1B1C1D1E1F101112131415161718191A1B1C1D1E1F"
      )
    })

    it("should accept inputs of multiple types and convert them accordingly", () => {
      let code = `
        push(1)     // number
        push(0x1)   // hex number (still typeof == "number")
        push(0x1n)  // bigint
        push("0x1") // hex string

        push(0x0001)    // leading zeroes are removed for all of these
        push(0x0001n)   // and treated as a single byte
        push("0x0001")

        push(0)         // But it should accept 0's of all types
        push(0n),
        push("0x0")

        // Note that pointer types are checked in the tests below
      `

      let bytecode = preprocess(code);

      expect(bytecode).toBe(
        "0x6001600160016001600160016001600060006000"
      )
    })

    it("should not accept non-0x-prefixed strings", () => {
      let code = `
        push("this is a string")
      `
      expect(() => {
        preprocess(code);
      }).toThrow();
    })

    it("should not allow pushing more than 32 bytes", () => {
      let code = `
        push("0x101112131415161718191A1B1C1D1E1F101112131415161718191A1B1C1D1E1FFF") // extra FF pushes it over the edge
      `

      expect(() => {
        let bytecode = preprocess(code);
      }).toThrow("Function push() cannot accept values larger than 32 bytes.");
    })
  })

  describe("pushXX (specific push functions)", () => {
    it("should work as expected, taking in an input variable", () => {
      let code = `
        push1(1)
        // ...
        push32("0x101112131415161718191A1B1C1D1E1F101112131415161718191A1B1C1D1E1F")
      `

      let bytecode = preprocess(code);

      expect(bytecode).toBe(
        "0x60017F101112131415161718191A1B1C1D1E1F101112131415161718191A1B1C1D1E1F"
      )
    })

    it("should explicity check byte length of passed value", () => {
      let code = `
        push3("0x1234")
      `

      expect(() => {
        let bytecode = preprocess(code);
      }).toThrow("Function push3() expected 3 bytes but received 2.");
    })
  })

  describe("pointers & jumps", () => {
    it("should encode pointers into a two byte value", () => {
      let code = `
        someLabel =
          push($ptr("someLabel"))
      `

      let bytecode = preprocess(code);

      expect(bytecode).toBe(
        "0x5B610000"
      )
    })

    it("should point to the correct location of named pointers when using $ptr() and jump()", () => {
      let code = `
        push(0x01)
        push(0x01)

        someLabel = 
          push(0x01)

        jump($ptr("someLabel"))
      `

      let bytecode = preprocess(code);

      expect(bytecode).toBe(
        "0x600160015B600161000456"
      )
    })

    it("should be able to use $ptr() syntax within jumps to jump to a label not yet seen at runtime", () => {
      let code = `
        jump($ptr("main"))

        push(0x01)  // dead code
        push(0x01)  // dead code

        main = 
          push(0x02)
      `

      let bytecode = preprocess(code);

      expect(bytecode).toBe(
        "0x61000856600160015B6002"
      )
    })

    it("should be able to use the variable syntax to jump to labels already seen at runtime", () => {
      let code = `
        mainloop = 
          push(0x01)
          jump(mainloop)
      `

      let bytecode = preprocess(code);

      expect(bytecode).toBe(
        "0x5B600161000056"
      )
    })

    it("should work normally if a parameter is not passed", () => {
      let code = `
        jumpdest()
        push(0)
        push(0)
        jumpi()
        push(0)
        jump()
      `

      let bytecode = preprocess(code);

      expect(bytecode).toBe(
        "0x5B6000600057600056"
      )
    })
  })

  describe("alloc()", () => {
    it("should get data into memory in word chunks, leaving [memory offset, byte length,...] on stack (input < 32 bytes)", () => {
      let code = `
        alloc(0x1)
      `

      let bytecode = preprocess(code);

      // Note that in this case, the input is less than 32 bytes, 
      // so a separate algorithm is used to push the data
      expect(bytecode).toBe(
        "0x600159600160F81B5952"
      )
    })

    it("should get data into memory in word chunks, leaving [memory offset, byte length,...] on stack (input < 32 bytes)", () => {
      let code = `
        alloc("0x1000111122223333444455556666777788889999AAAABBBBCCCCDDDDEEEEFFFF0000")
      `

      let bytecode = preprocess(code);

      // Note that in this case, the input is less than 32 bytes, 
      // so a separate algorithm is used to push the data
      expect(bytecode).toBe(
        "0x6022597F1000111122223333444455556666777788889999AAAABBBBCCCCDDDDEEEEFFFF595261000060F01B5952"
      )
    })
  })
});

describe("Expression Functions", () => {

  describe("$concat()", () => {
    it("should concatenate two values, maintaining byte sizes", () => {
      let code = `
        push($concat(1,1))
      `

      let bytecode = preprocess(code);

      expect(bytecode).toBe(
        "0x610101"
      )
    })

    // Note: I'm not entirely sure if this is the *right* behavior. 
    // But I wanted to ensure the check wasn't on the expression, but on the 
    // the action. e.g., I wanted to allow the most expression behavior.
    // We'll see how people use it.
    it("should concatenate values larger than 32 bytes", () => {
      let code = `
        SOME_CONSTANT = $concat(
          "0x101112131415161718191A1B1C1D1E1F101112131415161718191A1B1C1D1E1F",
          "0xFF"
        )

        push(1) // Just so the result's not empty
      `

      let bytecode = preprocess(code);

      expect(bytecode).toBe(
        "0x6001"
      )
    })
  })

  describe("$hex()", () => {
    // Using this as my oracle: https://onlineunicodetools.com/convert-unicode-to-hex

    it("correctly converts unicode strings to hex", () => {
      let code = `
        push($hex("This is some text"))
      `

      let bytecode = preprocess(code);

      expect(bytecode).toBe(
        "0x705468697320697320736F6D652074657874"
      )
    })
  })

  describe("$set()", () => {
    it("should create deployable bytecode when $set('deployable', true) is used", () => {
      let code = `
        $set("deployable", true)
        push(0xAAAA) // just something dinstinctive
      `

      let expectedRuntimeBytecode = "61AAAA"; // Without 0x-prefix
      let deployedBytecode = preprocess(code);

      // Note that our deployer code inserts an unused JUMPDEST (5B)
      // TODO: Determine which pointers are used in jumps and which are not;
      // remove JUMPDEST if not used in jumps.

      expect(deployedBytecode).toBe(
        "0x341561000A57600080FD5B600359816100158239F3" + expectedRuntimeBytecode
      )
    })
  })

  describe("$jumpmap()", () => {
    it("should create a map of jump dest values, padded right to 32 bytes", () => {
      let code = `
        push(
          $jumpmap(
            "one", 
            "two", 
            "three"
          )
        )

        one = 
          push(1)

        two = 
          push(2)

        three = 
          push(3)
      `

      let bytecode = preprocess(code);

      expect(bytecode).toBe(
        "0x7F00210024002700000000000000000000000000000000000000000000000000005B60015B60025B6003"
      )
    })
  })

})

describe("README example", () => {
  it("shouldn't error", () => {
    let code = `
      $set("deployable", true)

      const TIMES = 5;

      push(0)

      mainloop = 
        // ... do something here, TIMES times ...
        // Now check counter
      
        push(1) // Add 1 to the index
        add()
        dup1()  // save a copy for the next operation
        push(TIMES)
        gt()    // TIMES > index ? push(1); push(0)
        jumpi(mainloop)
      
      stop()
    `

    let bytecode = preprocess(code);

    expect(bytecode).toBe(
      "0x341561000A57600080FD5B600F59816100158239F360005B600101806005116100025700"
      // ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ deployment preamble
    )
  })
})