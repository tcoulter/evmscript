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

  it("allows macro functions", () => {
    let code = `
      __myMacro = (val) => {
        push(val)
      }

      __myMacro(1)
      __myMacro(2)
      __myMacro(3)
      __myMacro(4)
    `

    let bytecode = preprocess(code);

    expect(bytecode).toBe(
      "0x6001600260036004"
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
      }).toThrow("Expected input to be a hexable value");
    })

    it("should not allow pushing more than 32 bytes", () => {
      let code = `
        push("0x101112131415161718191A1B1C1D1E1F101112131415161718191A1B1C1D1E1FFF") // extra FF pushes it over the edge
      `

      expect(() => {
        let bytecode = preprocess(code);
      }).toThrow("Expected input to be less than or equal to 32 bytes");
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

    it("shouldn't push offsets to the stack if second parameter is false", () => {
      let code = `
        alloc(0x1, false)
      `

      let bytecode = preprocess(code);

      // Note that in this case, the input is less than 32 bytes, 
      // so a separate algorithm is used to push the data
      expect(bytecode).toBe(
        "0x600160F81B5952"
      )
    })
  });

  describe("allocStack()", () => {
    it("should alloc N items from the stack into memory if a number is passed in", () => {
      let code = `
        allocStack(3)
      `

      let bytecode = preprocess(code);

      expect(bytecode).toBe(
        "0x5952595259526060805903"
      )
    })

    it("should alloc N items from the stack into memory if a number is passed in, but not push offsets if second parameter is false", () => {
      let code = `
        allocStack(3, false)
      `

      let bytecode = preprocess(code);

      expect(bytecode).toBe(
        "0x595259525952"
      )
    })

    it("should alloc a stack reference if a stack reference is passed in", () => {
      let code = `
        ;[$val] = push(0)
        allocStack($val)
      `

      let bytecode = preprocess(code);

      expect(bytecode).toBe(
        "0x600059815952602090"
      )
    })

    it("should alloc a stack reference if a stack reference is passed in, but not push offsets if second parameter is false", () => {
      let code = `
        ;[$val] = push(0)
        allocStack($val, false)
      `

      let bytecode = preprocess(code);

      expect(bytecode).toBe(
        "0x6000805952"
      )
    })
  })

  describe("calldataload()", () => {
    it("should treat the second parameter passed to calldataload() as a helpful shift", () => {
      let code = `
        // location, byte shift
        // This means load the value at calldata position 0x04,
        // then shift it so we only keep 2 bytes
        calldataload(4, 2)
      `

      let bytecode = preprocess(code);

      expect(bytecode).toBe(
        "0x60043560F01C"
      )
    })
  })

  describe("method()", () => {
    it("should push code contained in method() to the end", () => {
      let code = `
        methodLabel = method(() => {
          jump($ptr("main"))
        })

        main = 
          push(0x1122)
      `

      let bytecode = preprocess(code);

      expect(bytecode).toBe(
        "0x5B6111225B61000056"
      )
    })

    it("should return the right jump location regardless of where the method definition occurs", () => {
      // This test tests that the jump location used in main
      // comes later on in the bytecode, which it does, even
      // though the method definition comes beforehand.
      
      let code = `
        methodLabel = method(() => {
          jump($ptr("main"))
        })

        main = 
          push(methodLabel)
      `

      let bytecode = preprocess(code);

      expect(bytecode).toBe(
        "0x5B6100045B61000056"
      )
    })

    it("enforces that the last instruction in a method is a jump, return or revert", () => {
      // Methods are meant to be self contained. Without a jump they 
      // have ambigous control flow based on the location of the method 
      // within the bytecode. 

      let code = `
        methodLabel = method(() => {
          push(1)
          pop() // So that we have stack neutrality (see next test)
        })
      `

      expect(() => {
        preprocess(code)
      }).toThrowError("To maintain proper control flow, the last instruction of a method must be JUMP, RETURN or REVERT");
    
      code = `
        somePointer = 
          push(1)

        method(() => {
          jump(somePointer)
        })

        method(() => {
          push(1)
          push(2)
          ret()
        })

        method(() => {
          push(1)
          push(2)
          revert()
        })

        method(() => {
          revert($hex("some error"))
        })
      `

      expect(() => {
        preprocess(code)
      }).not.toThrowError();
    })

    it("enforces stack neutrality; methods need to end with the same stack size so as not to screw up stack references", () => {
      let code = `
        method(() => {
          ret()
        })
      `

      expect(() => {
        preprocess(code)
      }).toThrowError("Methods are required to be stack neutral. This method's stack size diff is: -2 stack items");
    
      code = `
        method(() => {
          push(1) // for the ret() action
          push(2)
          ret()
        })
      `

      expect(() => {
        preprocess(code)
      }).not.toThrowError();
    })

    it("should allow using stack references within methods, and correctly handle child actions", () => {
      let code = `
        someLabel = 
          [$val] = push(1)

        method(() => {
          set($val, add($val, 1))
          jump(someLabel) // for jump constraint
        })
      `

      let bytecode = preprocess(code);

      expect(bytecode).toBe(
        "0x5B600160018101905061000056"
      )
    })

    it("should allow defining (and using) stack references within methods", () => {
      let code = `
        method(() => {
          [$val] = push(1)
          dup($val)
          ret()
        })
      `

      let bytecode = preprocess(code);

      expect(bytecode).toBe(
        "0x600180F3"
      )
    })

    it("allows macro functions within methods", () => {
      let code = `
        __myMacro = (val) => {
          push(val)
        }
  
        someLabel = method(() => {
          __myMacro(1)
          push(2)
          ret()
        })
      `
  
      let bytecode = preprocess(code);
  
      expect(bytecode).toBe(
        "0x5B60016002F3"
      )
    })

    it("doesn't break composability error checking due to Action.forcePush()", () => {
      let code = `
        __myMacro = (val) => {
          // assert doesn't accept action pointers created beforehand
          let a = push(1);
          assert(a);
        }

        someLabel = method(() => {
          __myMacro(1)
          pop() // to stay stack neutral
          jump($ptr("someLabel"))
        })
      `

      expect(() => {
        preprocess(code)
      }).toThrowError("Attempting to pass previously executed action to assert()")
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

  describe("$pad()", () => {
    it("correctly pads left", () => {
      let code = `
        push4(
          $pad(1, 4)
        )
      `

      let bytecode = preprocess(code);

      expect(bytecode).toBe(
        "0x6300000001"
      )
    })

    it("correctly pads right", () => {
      let code = `
        push4(
          $pad(1, 4, "right")
        )
      `

      let bytecode = preprocess(code);

      expect(bytecode).toBe(
        "0x6301000000"
      )
    })
  })

  describe("$()", () => {
    it("should create deployable bytecode when $('deployable', true) is used", () => {
      let code = `
        $("deployable", true)
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
      $("deployable", true)

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

describe("Stack References", () => {
  describe("General Processing", () => {
    it("should allow stack references through array splatting the result of an action", () => {
      let code = `
        [$pushedValue] = push(0x1)

        // throwing some javascript in there, just to be doubly sure
        if (typeof $pushedValue == "undefined") {
          throw new Error("Apparently $pushedValue was undefined!")
        }
      `

      expect(() => {
        preprocess(code)
      }).not.toThrowError();
    })

    it("should allow stack references in common actions, converting references to DUP's", () => {
      let code = `
      [$value1] = push(0x1);
      [$value2] = push(0x2); 

      // Since $value2 is rightmost, it needs to be on the stack first
      // before $value1. Since it's referencing the top of the stack, 
      // copying $value2 will be a DUP1, and the copying $value1 
      // will be a DUP3 (because we just added another stack item
      // with the DUP1)!

      add($value1, $value2);
      `

      let bytecode = preprocess(code);

      // The test here is that: 
      // A) it translates the references to DUPs, and
      // B) it recognizes that the second DUP is a DUP2 because the first DUP was added
      expect(bytecode).toBe(
        "0x60016002808201"
      )
    })

    it("should properly convert relative stack references passed to the dup() helper", () => {
      let code = `
        ;[$val] = push(5)
        push(3)
        dup($val)
      `

      let bytecode = preprocess(code);

      expect(bytecode).toBe(
        "0x6005600381"
      )
    })

    // it("should properly convert relative stack references")

    it("should error when trying to dup a stack reference that's too deep", () => {
      let code = `
        ;[$val0] = push(0)
        ;[$val1] = push(1)
        ;[$val2] = push(2)
        ;[$val3] = push(3)
        ;[$val4] = push(4)
        ;[$val5] = push(5)
        ;[$val6] = push(6)
        ;[$val7] = push(7)
        ;[$val8] = push(8)
        ;[$val9] = push(9)
        ;[$valA] = push(10)
        ;[$valB] = push(11)
        ;[$valC] = push(12)
        ;[$valD] = push(13)
        ;[$valE] = push(14)
        ;[$valF] = push(15)
        ;[$val10] = push(16) // This puts $val0 out of range of a DUP

        // This should throw. $val0 is too deep
        add($val0, 1)
      `

      expect(() => {
        preprocess(code)
      }).toThrowError("Stack reference from push() is too deep; cannot use DUP" /* partial message check */);
    })

    it("should error when trying to swap a stack reference that's too deep", () => {
      let code = `
        ;[$val0] = push(0)
        ;[$val1] = push(1)
        ;[$val2] = push(2)
        ;[$val3] = push(3)
        ;[$val4] = push(4)
        ;[$val5] = push(5)
        ;[$val6] = push(6)
        ;[$val7] = push(7)
        ;[$val8] = push(8)
        ;[$val9] = push(9)
        ;[$valA] = push(10)
        ;[$valB] = push(11)
        ;[$valC] = push(12)
        ;[$valD] = push(13)
        ;[$valE] = push(14)
        ;[$valF] = push(15)
        ;[$val10] = push(16) // This puts $val0 out of range of a DUP

        // This should throw. $val0 is too deep
        set($val0, 1)
      `

      expect(() => {
        preprocess(code)
      }).toThrowError("Stack reference from push() is too deep; cannot use SWAP" /* partial message check */);
    })
  })
})

describe("Composable functions", () => {
  it("functions are composable, and arguments are processed right to left", () => {
    let code = `
      add(5, mul(2,3))
    `

    let bytecode = preprocess(code);

    expect(bytecode).toBe(
      "0x6003600202600501"
    )
  })

  it("places the jumpdest for loops before all child actions", () => {
    let code = `
      loop =
        jumpi($ptr("endloop"), eq(1, 1))

      endloop=
        stop()
    `

    let bytecode = preprocess(code);

    expect(bytecode).toBe(
      "0x5B600160011461000A575B00"
    )
  })
})
// TODO: Error messages on function sanitization
// TODO: Error messages when attempting to redefine a built in function