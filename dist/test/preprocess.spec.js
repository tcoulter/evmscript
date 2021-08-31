"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var expect_1 = __importDefault(require("expect"));
var src_1 = require("../src");
describe('General Processing', function () {
    it("prefixes output with 0x and capitalizes output", function () {
        var code = "\n      push(\"0xff\")\n    ";
        var bytecode = (0, src_1.preprocess)(code);
        (0, expect_1.default)(bytecode).toBe("0x60FF");
    });
    it("errors on Javscript syntax errors", function () {
        var code = "\n      push(\"0xff\"    // No closing paranthesis\n    ";
        (0, expect_1.default)(function () {
            (0, src_1.preprocess)(code);
        }).toThrow();
    });
    it("allows the user to specify extra context variables", function () {
        var code = "\n      push(SOME_CONSTANT)\n    ";
        var bytecode = (0, src_1.preprocess)(code, {
            SOME_CONSTANT: 5
        });
        (0, expect_1.default)(bytecode).toBe("0x6005");
    });
});
describe('Action Functions', function () {
    describe("push (generalized push)", function () {
        it("should choose the right push instruction based on input", function () {
            var code = "\n        push(0x11)\n        push(0x1111)\n        push(0x111111)\n        // We'll assume that if it gets these three correct, it's good\n        // Put for good measure, let's test the last one\n        push(\"0x101112131415161718191A1B1C1D1E1F101112131415161718191A1B1C1D1E1F\")  \n      ";
            var bytecode = (0, src_1.preprocess)(code);
            (0, expect_1.default)(bytecode).toBe("0x6011611111621111117F101112131415161718191A1B1C1D1E1F101112131415161718191A1B1C1D1E1F");
        });
        it("should accept inputs of multiple types and convert them accordingly", function () {
            var code = "\n        push(1)     // number\n        push(0x1)   // hex number (still typeof == \"number\")\n        push(0x1n)  // bigint\n        push(\"0x1\") // hex string\n\n        push(0x0001)    // leading zeroes are removed for all of these\n        push(0x0001n)   // and treated as a single byte\n        push(\"0x0001\")\n\n        push(0)         // But it should accept 0's of all types\n        push(0n),\n        push(\"0x0\")\n\n        // Note that pointer types are checked in the tests below\n      ";
            var bytecode = (0, src_1.preprocess)(code);
            (0, expect_1.default)(bytecode).toBe("0x6001600160016001600160016001600060006000");
        });
        it("should not accept non-0x-prefixed strings", function () {
            var code = "\n        push(\"this is a string\")\n      ";
            (0, expect_1.default)(function () {
                (0, src_1.preprocess)(code);
            }).toThrow();
        });
        it("should not allow pushing more than 32 bytes", function () {
            var code = "\n        push(\"0x101112131415161718191A1B1C1D1E1F101112131415161718191A1B1C1D1E1FFF\") // extra FF pushes it over the edge\n      ";
            (0, expect_1.default)(function () {
                var bytecode = (0, src_1.preprocess)(code);
            }).toThrow("Function push() cannot accept values larger than 32 bytes.");
        });
    });
    describe("pushXX (specific push functions)", function () {
        it("should work as expected, taking in an input variable", function () {
            var code = "\n        push1(1)\n        // ...\n        push32(\"0x101112131415161718191A1B1C1D1E1F101112131415161718191A1B1C1D1E1F\")\n      ";
            var bytecode = (0, src_1.preprocess)(code);
            (0, expect_1.default)(bytecode).toBe("0x60017F101112131415161718191A1B1C1D1E1F101112131415161718191A1B1C1D1E1F");
        });
        it("should explicity check byte length of passed value", function () {
            var code = "\n        push3(\"0x1234\")\n      ";
            (0, expect_1.default)(function () {
                var bytecode = (0, src_1.preprocess)(code);
            }).toThrow("Function push3() expected 3 bytes but received 2.");
        });
    });
    describe("pointers & jumps", function () {
        it("should encode pointers into a two byte value", function () {
            var code = "\n        someLabel =\n          push($ptr(\"someLabel\"))\n      ";
            var bytecode = (0, src_1.preprocess)(code);
            (0, expect_1.default)(bytecode).toBe("0x5B610000");
        });
        it("should point to the correct location of named pointers when using $ptr() and jump()", function () {
            var code = "\n        push(0x01)\n        push(0x01)\n\n        someLabel = \n          push(0x01)\n\n        jump($ptr(\"someLabel\"))\n      ";
            var bytecode = (0, src_1.preprocess)(code);
            (0, expect_1.default)(bytecode).toBe("0x600160015B600161000456");
        });
        it("should be able to use $ptr() syntax within jumps to jump to a label not yet seen at runtime", function () {
            var code = "\n        jump($ptr(\"main\"))\n\n        push(0x01)  // dead code\n        push(0x01)  // dead code\n\n        main = \n          push(0x02)\n      ";
            var bytecode = (0, src_1.preprocess)(code);
            (0, expect_1.default)(bytecode).toBe("0x61000856600160015B6002");
        });
        it("should be able to use the variable syntax to jump to labels already seen at runtime", function () {
            var code = "\n        mainloop = \n          push(0x01)\n          jump(mainloop)\n      ";
            var bytecode = (0, src_1.preprocess)(code);
            (0, expect_1.default)(bytecode).toBe("0x5B600161000056");
        });
        it("should work normally if a parameter is not passed", function () {
            var code = "\n        jumpdest()\n        push(0)\n        push(0)\n        jumpi()\n        push(0)\n        jump()\n      ";
            var bytecode = (0, src_1.preprocess)(code);
            (0, expect_1.default)(bytecode).toBe("0x5B6000600057600056");
        });
    });
});
describe("Expression Functions", function () {
    describe("$concat", function () {
        it("should concatenate two values, maintaining byte sizes", function () {
            var code = "\n        push($concat(1,1))\n      ";
            var bytecode = (0, src_1.preprocess)(code);
            (0, expect_1.default)(bytecode).toBe("0x610101");
        });
        // Note: I'm not entirely sure if this is the *right* behavior. 
        // But I wanted to ensure the check wasn't on the expression, but on the 
        // the action. e.g., I wanted to allow the most expression behavior.
        // We'll see how people use it.
        it("should concatenate values larger than 32 bytes", function () {
            var code = "\n        SOME_CONSTANT = $concat(\n          \"0x101112131415161718191A1B1C1D1E1F101112131415161718191A1B1C1D1E1F\",\n          \"0xFF\"\n        )\n\n        push(1) // Just so the result's not empty\n      ";
            var bytecode = (0, src_1.preprocess)(code);
            (0, expect_1.default)(bytecode).toBe("0x6001");
        });
    });
    describe("$set", function () {
        it("should create deployable bytecode when $set('deployable', true) is used", function () {
            var code = "\n        $set(\"deployable\", true)\n        push(0xAAAA) // just something dinstinctive\n      ";
            var expectedRuntimeBytecode = "61AAAA"; // Without 0x-prefix
            var deployedBytecode = (0, src_1.preprocess)(code);
            // Note that our deployer code inserts an unused JUMPDEST (5B)
            // TODO: Determine which pointers are used in jumps and which are not;
            // remove JUMPDEST if not used in jumps.
            (0, expect_1.default)(deployedBytecode).toBe("0x341561000A57600080FD5B6003604051816100178239F35B" + expectedRuntimeBytecode);
        });
    });
});
describe("README example", function () {
    it("shouldn't error", function () {
        var code = "\n      $set(\"deployable\", true)\n\n      const TIMES = 5;\n\n      push(0)\n\n      mainloop = \n        // ... do something here, TIMES times ...\n        // Now check counter\n      \n        push(1) // Add 1 to the index\n        add()\n        dup1()  // save a copy for the next operation\n        push(TIMES)\n        gt()    // TIMES > index ? push(1); push(0)\n        jumpi(mainloop)\n      \n      stop()\n    ";
        var bytecode = (0, src_1.preprocess)(code);
        (0, expect_1.default)(bytecode).toBe("0x341561000A57600080FD5B600F604051816100178239F35B60005B600101806005116100025700"
        // ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ deployment preamble
        );
    });
});
