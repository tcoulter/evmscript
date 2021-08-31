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
exports.ensureFullByte = exports.leftPad = exports.translateToBytecode = exports.createExpressionAndContextHandlers = exports.createActionHandler = exports.byteLength = exports.POINTER_BYTE_LENGTH = void 0;
var grammar_1 = require("./grammar");
exports.POINTER_BYTE_LENGTH = 2;
function byteLength(input) {
    if (input instanceof grammar_1.Hexable) {
        return input.byteLength();
    }
    if (typeof input == "number") {
        input = BigInt(input);
        // Don't return; let next block take care of it.
    }
    if (typeof input == "bigint") {
        var length_1 = input.toString(16).length;
        return Math.floor(length_1 / 2) + (length_1 % 2);
    }
    throw new Error("Unknown input to byteLength(): " + input);
}
exports.byteLength = byteLength;
function createActionHandler(runtimeContext, key, fn) {
    var handler = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        var actionSource = runtimeContext.getActionSource();
        var actionPointer = actionSource.getPointer();
        runtimeContext.intermediate.push(actionSource);
        args = args.map(function (input) { return (0, grammar_1.sanitize)(input, key, true); });
        fn.apply(null, __spreadArray([runtimeContext], args, true));
        return actionPointer;
    };
    return handler;
}
exports.createActionHandler = createActionHandler;
function createExpressionAndContextHandlers(runtimeContext, key, fn) {
    // Note that Expression has the largest surface area of available types,
    // so it applies to all function types.
    var handler = function () {
        var args = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            args[_i] = arguments[_i];
        }
        args = args.map(function (input) { return (0, grammar_1.sanitize)(input, key, false); });
        return fn.apply(null, __spreadArray([runtimeContext], args, true));
    };
    return handler;
}
exports.createExpressionAndContextHandlers = createExpressionAndContextHandlers;
function translateToBytecode(item, executedCodeContext, jumpDestinations) {
    var bytecode = "";
    if (item instanceof grammar_1.Hexable) {
        bytecode = item.toHex(executedCodeContext, jumpDestinations);
    }
    else {
        bytecode = item.toString(16);
    }
    return ensureFullByte(bytecode);
}
exports.translateToBytecode = translateToBytecode;
function leftPad(bytecode, byteLength) {
    while (bytecode.length < byteLength * 2) {
        bytecode = "0" + bytecode;
    }
    return bytecode;
}
exports.leftPad = leftPad;
function ensureFullByte(bytecode) {
    while (bytecode.length % 2 != 0) {
        bytecode = "0" + bytecode;
    }
    return bytecode;
}
exports.ensureFullByte = ensureFullByte;
