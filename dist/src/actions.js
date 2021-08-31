"use strict";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.contextFunctions = exports.expressionFunctions = exports.actionFunctions = void 0;
// See https://ethervm.io/ for opcode reference
var grammar_1 = require("./grammar");
var helpers_1 = require("./helpers");
function push(context, input) {
    Array.prototype.push.apply(context.intermediate, [
        grammar_1.Instruction["PUSH" + (0, helpers_1.byteLength)(input)],
        input
    ]);
}
// Create actions for all the push functions, translating to the generalized push function
var specificPushFunctions = Array.from(Array(32).keys()).map(function (index) {
    return function (context, input) {
        // Since the byte length was requested specifically, lets make
        // the user passed the right amount of bytes.
        var expectedByteLength = index + 1;
        var actualByteLength = (0, helpers_1.byteLength)(input);
        if (actualByteLength != expectedByteLength) {
            throw new Error("Function push" + expectedByteLength + "() expected " + expectedByteLength + " bytes but received " + actualByteLength + ".");
        }
        Array.prototype.push.apply(context.intermediate, [
            grammar_1.Instruction["PUSH" + (index + 1)],
            input
        ]);
    };
});
function getmem(context) {
    Array.prototype.push.apply(context.intermediate, [
        grammar_1.Instruction.PUSH1,
        BigInt(0x40),
        grammar_1.Instruction.MLOAD
    ]);
}
function jump(context, input) {
    if (typeof input != "undefined") {
        push(context, input);
    }
    context.intermediate.push(grammar_1.Instruction.JUMP);
}
function jumpi(context, input) {
    if (typeof input != "undefined") {
        push(context, input);
    }
    context.intermediate.push(grammar_1.Instruction.JUMPI);
}
function insert(context) {
    var args = [];
    for (var _i = 1; _i < arguments.length; _i++) {
        args[_i - 1] = arguments[_i];
    }
    Array.prototype.push.apply(context.intermediate, args);
}
function $set(context, key, value) {
    // TODO: key and value check; don't let users set wrong stuff/set incorrectly
    context[key.toString().trim()] = value;
}
function $ptr(context, labelName) {
    return new grammar_1.LabelPointer(labelName);
}
function $concat(context) {
    var args = [];
    for (var _i = 1; _i < arguments.length; _i++) {
        args[_i - 1] = arguments[_i];
    }
    return new (grammar_1.ConcatedHexValue.bind.apply(grammar_1.ConcatedHexValue, __spreadArray([void 0], args, false)))();
}
function $bytelen(context, input) {
    return (0, helpers_1.byteLength)(input);
}
// Ideas: 
// 
// $hex -> convert to hex
// e.g., $hex("this is a revert string")
//
// revert("this is a revert string")  // even better?
//
// $keccak -> sha3, for defining solidity functions
// e.g. $keccak("setOwner(address)").substring(0, 4)
//  or? $keccak4(...)
//  or? $keccak("setOwner(address)", 4)
//  or  $keccak(...) and $4byte(...) or something?
//
//  callSolidity(/*address*/ "0x...", "someFunction(address, uint)", ... params ...)
//
//  insert(...hex string..) -> directly insert bytecode at specified position. Check validity?
exports.actionFunctions = {
    push: push,
    getmem: getmem,
    insert: insert,
    jump: jump,
    jumpi: jumpi
};
specificPushFunctions.forEach(function (fn, index) {
    exports.actionFunctions["push" + (index + 1)] = fn;
});
exports.expressionFunctions = {
    $concat: $concat,
    $bytelen: $bytelen,
    $ptr: $ptr
};
exports.contextFunctions = {
    $set: $set
};
