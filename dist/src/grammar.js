"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitize = exports.ConcatedHexValue = exports.ActionPointer = exports.ActionSource = exports.LabelPointer = exports.Hexable = exports.ConfigKeys = exports.Instruction = void 0;
var helpers_1 = require("./helpers");
var Instruction;
(function (Instruction) {
    Instruction[Instruction["STOP"] = 0] = "STOP";
    Instruction[Instruction["ADD"] = 1] = "ADD";
    Instruction[Instruction["MUL"] = 2] = "MUL";
    Instruction[Instruction["SUB"] = 3] = "SUB";
    Instruction[Instruction["DIV"] = 4] = "DIV";
    Instruction[Instruction["SDIV"] = 5] = "SDIV";
    Instruction[Instruction["MOD"] = 6] = "MOD";
    Instruction[Instruction["SMOD"] = 7] = "SMOD";
    Instruction[Instruction["ADDMOD"] = 8] = "ADDMOD";
    Instruction[Instruction["MULMOD"] = 9] = "MULMOD";
    Instruction[Instruction["EXP"] = 10] = "EXP";
    Instruction[Instruction["SIGNEXTEND"] = 11] = "SIGNEXTEND";
    Instruction[Instruction["LT"] = 16] = "LT";
    Instruction[Instruction["GT"] = 17] = "GT";
    Instruction[Instruction["SLT"] = 18] = "SLT";
    Instruction[Instruction["SGT"] = 19] = "SGT";
    Instruction[Instruction["EQ"] = 20] = "EQ";
    Instruction[Instruction["ISZERO"] = 21] = "ISZERO";
    Instruction[Instruction["AND"] = 22] = "AND";
    Instruction[Instruction["OR"] = 23] = "OR";
    Instruction[Instruction["XOR"] = 24] = "XOR";
    Instruction[Instruction["NOT"] = 25] = "NOT";
    Instruction[Instruction["BYTE"] = 26] = "BYTE";
    Instruction[Instruction["SHL"] = 27] = "SHL";
    Instruction[Instruction["SHR"] = 28] = "SHR";
    Instruction[Instruction["SAR"] = 29] = "SAR";
    Instruction[Instruction["SHA3"] = 32] = "SHA3";
    Instruction[Instruction["ADDRESS"] = 48] = "ADDRESS";
    Instruction[Instruction["BALANCE"] = 49] = "BALANCE";
    Instruction[Instruction["ORIGIN"] = 50] = "ORIGIN";
    Instruction[Instruction["CALLER"] = 51] = "CALLER";
    Instruction[Instruction["CALLVALUE"] = 52] = "CALLVALUE";
    Instruction[Instruction["CALLDATALOAD"] = 53] = "CALLDATALOAD";
    Instruction[Instruction["CALLDATASIZE"] = 54] = "CALLDATASIZE";
    Instruction[Instruction["CALLDATACOPY"] = 55] = "CALLDATACOPY";
    Instruction[Instruction["CODESIZE"] = 56] = "CODESIZE";
    Instruction[Instruction["CODECOPY"] = 57] = "CODECOPY";
    Instruction[Instruction["GASPRICE"] = 58] = "GASPRICE";
    Instruction[Instruction["EXTCODESIZE"] = 59] = "EXTCODESIZE";
    Instruction[Instruction["EXTCODECOPY"] = 60] = "EXTCODECOPY";
    Instruction[Instruction["RETURNDATASIZE"] = 61] = "RETURNDATASIZE";
    Instruction[Instruction["RETURNDATACOPY"] = 62] = "RETURNDATACOPY";
    Instruction[Instruction["EXTCODEHASH"] = 63] = "EXTCODEHASH";
    Instruction[Instruction["BLOCKHASH"] = 64] = "BLOCKHASH";
    Instruction[Instruction["COINBASE"] = 65] = "COINBASE";
    Instruction[Instruction["TIMESTAMP"] = 66] = "TIMESTAMP";
    Instruction[Instruction["NUMBER"] = 67] = "NUMBER";
    Instruction[Instruction["DIFFICULTY"] = 68] = "DIFFICULTY";
    Instruction[Instruction["GASLIMIT"] = 69] = "GASLIMIT";
    Instruction[Instruction["CHAINID"] = 70] = "CHAINID";
    Instruction[Instruction["SELFBALANCE"] = 71] = "SELFBALANCE";
    Instruction[Instruction["BASEFEE"] = 72] = "BASEFEE";
    Instruction[Instruction["POP"] = 80] = "POP";
    Instruction[Instruction["MLOAD"] = 81] = "MLOAD";
    Instruction[Instruction["MSTORE"] = 82] = "MSTORE";
    Instruction[Instruction["MSTORE8"] = 83] = "MSTORE8";
    Instruction[Instruction["SLOAD"] = 84] = "SLOAD";
    Instruction[Instruction["SSTORE"] = 85] = "SSTORE";
    Instruction[Instruction["JUMP"] = 86] = "JUMP";
    Instruction[Instruction["JUMPI"] = 87] = "JUMPI";
    Instruction[Instruction["PC"] = 88] = "PC";
    Instruction[Instruction["MSIZE"] = 89] = "MSIZE";
    Instruction[Instruction["GAS"] = 90] = "GAS";
    Instruction[Instruction["JUMPDEST"] = 91] = "JUMPDEST";
    Instruction[Instruction["PUSH1"] = 96] = "PUSH1";
    Instruction[Instruction["PUSH2"] = 97] = "PUSH2";
    Instruction[Instruction["PUSH3"] = 98] = "PUSH3";
    Instruction[Instruction["PUSH4"] = 99] = "PUSH4";
    Instruction[Instruction["PUSH5"] = 100] = "PUSH5";
    Instruction[Instruction["PUSH6"] = 101] = "PUSH6";
    Instruction[Instruction["PUSH7"] = 102] = "PUSH7";
    Instruction[Instruction["PUSH8"] = 103] = "PUSH8";
    Instruction[Instruction["PUSH9"] = 104] = "PUSH9";
    Instruction[Instruction["PUSH10"] = 105] = "PUSH10";
    Instruction[Instruction["PUSH11"] = 106] = "PUSH11";
    Instruction[Instruction["PUSH12"] = 107] = "PUSH12";
    Instruction[Instruction["PUSH13"] = 108] = "PUSH13";
    Instruction[Instruction["PUSH14"] = 109] = "PUSH14";
    Instruction[Instruction["PUSH15"] = 110] = "PUSH15";
    Instruction[Instruction["PUSH16"] = 111] = "PUSH16";
    Instruction[Instruction["PUSH17"] = 112] = "PUSH17";
    Instruction[Instruction["PUSH18"] = 113] = "PUSH18";
    Instruction[Instruction["PUSH19"] = 114] = "PUSH19";
    Instruction[Instruction["PUSH20"] = 115] = "PUSH20";
    Instruction[Instruction["PUSH21"] = 116] = "PUSH21";
    Instruction[Instruction["PUSH22"] = 117] = "PUSH22";
    Instruction[Instruction["PUSH23"] = 118] = "PUSH23";
    Instruction[Instruction["PUSH24"] = 119] = "PUSH24";
    Instruction[Instruction["PUSH25"] = 120] = "PUSH25";
    Instruction[Instruction["PUSH26"] = 121] = "PUSH26";
    Instruction[Instruction["PUSH27"] = 122] = "PUSH27";
    Instruction[Instruction["PUSH28"] = 123] = "PUSH28";
    Instruction[Instruction["PUSH29"] = 124] = "PUSH29";
    Instruction[Instruction["PUSH30"] = 125] = "PUSH30";
    Instruction[Instruction["PUSH31"] = 126] = "PUSH31";
    Instruction[Instruction["PUSH32"] = 127] = "PUSH32";
    Instruction[Instruction["DUP1"] = 128] = "DUP1";
    Instruction[Instruction["DUP2"] = 129] = "DUP2";
    Instruction[Instruction["DUP3"] = 130] = "DUP3";
    Instruction[Instruction["DUP4"] = 131] = "DUP4";
    Instruction[Instruction["DUP5"] = 132] = "DUP5";
    Instruction[Instruction["DUP6"] = 133] = "DUP6";
    Instruction[Instruction["DUP7"] = 134] = "DUP7";
    Instruction[Instruction["DUP8"] = 135] = "DUP8";
    Instruction[Instruction["DUP9"] = 136] = "DUP9";
    Instruction[Instruction["DUP10"] = 137] = "DUP10";
    Instruction[Instruction["DUP11"] = 138] = "DUP11";
    Instruction[Instruction["DUP12"] = 139] = "DUP12";
    Instruction[Instruction["DUP13"] = 140] = "DUP13";
    Instruction[Instruction["DUP14"] = 141] = "DUP14";
    Instruction[Instruction["DUP15"] = 142] = "DUP15";
    Instruction[Instruction["DUP16"] = 143] = "DUP16";
    Instruction[Instruction["SWAP1"] = 144] = "SWAP1";
    Instruction[Instruction["SWAP2"] = 145] = "SWAP2";
    Instruction[Instruction["SWAP3"] = 146] = "SWAP3";
    Instruction[Instruction["SWAP4"] = 147] = "SWAP4";
    Instruction[Instruction["SWAP5"] = 148] = "SWAP5";
    Instruction[Instruction["SWAP6"] = 149] = "SWAP6";
    Instruction[Instruction["SWAP7"] = 150] = "SWAP7";
    Instruction[Instruction["SWAP8"] = 151] = "SWAP8";
    Instruction[Instruction["SWAP9"] = 152] = "SWAP9";
    Instruction[Instruction["SWAP10"] = 153] = "SWAP10";
    Instruction[Instruction["SWAP11"] = 154] = "SWAP11";
    Instruction[Instruction["SWAP12"] = 155] = "SWAP12";
    Instruction[Instruction["SWAP13"] = 156] = "SWAP13";
    Instruction[Instruction["SWAP14"] = 157] = "SWAP14";
    Instruction[Instruction["SWAP15"] = 158] = "SWAP15";
    Instruction[Instruction["SWAP16"] = 159] = "SWAP16";
    Instruction[Instruction["LOG0"] = 160] = "LOG0";
    Instruction[Instruction["LOG1"] = 161] = "LOG1";
    Instruction[Instruction["LOG2"] = 162] = "LOG2";
    Instruction[Instruction["LOG3"] = 163] = "LOG3";
    Instruction[Instruction["LOG4"] = 164] = "LOG4";
    Instruction[Instruction["CREATE"] = 240] = "CREATE";
    Instruction[Instruction["CALL"] = 241] = "CALL";
    Instruction[Instruction["CALLCODE"] = 242] = "CALLCODE";
    Instruction[Instruction["RETURN"] = 243] = "RETURN";
    Instruction[Instruction["DELEGATECALL"] = 244] = "DELEGATECALL";
    Instruction[Instruction["CREATE2"] = 245] = "CREATE2";
    Instruction[Instruction["STATICCALL"] = 250] = "STATICCALL";
    Instruction[Instruction["REVERT"] = 253] = "REVERT";
    Instruction[Instruction["SELFDESTRUCT"] = 255] = "SELFDESTRUCT";
})(Instruction = exports.Instruction || (exports.Instruction = {}));
var ConfigKeys;
(function (ConfigKeys) {
    ConfigKeys["deployable"] = "deployable";
})(ConfigKeys = exports.ConfigKeys || (exports.ConfigKeys = {}));
var Hexable = /** @class */ (function () {
    function Hexable() {
    }
    return Hexable;
}());
exports.Hexable = Hexable;
// Mostly for typing.
var LabelPointer = /** @class */ (function (_super) {
    __extends(LabelPointer, _super);
    function LabelPointer(labelName) {
        var _this = _super.call(this) || this;
        _this.labelName = "";
        _this.labelName = labelName;
        return _this;
    }
    LabelPointer.prototype.toHex = function (executedCodeContext, jumpDestinations) {
        var actionPointer = executedCodeContext[this.labelName];
        if (!actionPointer || !(actionPointer instanceof ActionPointer)) {
            throw new Error("Unknown label pointer '" + this.labelName + "' or label set incorrectly. Make sure to always set variables to the result of an action function (a function that *doesn't* start with $).");
        }
        return actionPointer.toHex(executedCodeContext, jumpDestinations);
    };
    LabelPointer.prototype.byteLength = function () {
        return helpers_1.POINTER_BYTE_LENGTH;
    };
    return LabelPointer;
}(Hexable));
exports.LabelPointer = LabelPointer;
var ActionSource = /** @class */ (function (_super) {
    __extends(ActionSource, _super);
    function ActionSource(actionIndex) {
        var _this = _super.call(this) || this;
        _this.actionIndex = 0;
        _this.isUsed = false;
        _this.actionIndex = actionIndex;
        return _this;
    }
    ActionSource.prototype.getPointer = function () {
        return new ActionPointer(this);
    };
    ActionSource.prototype.toHex = function (executedCodeContext, jumpDestinations) {
        if (this.isUsed) {
            return (0, helpers_1.translateToBytecode)(Instruction.JUMPDEST, executedCodeContext, jumpDestinations);
        }
        return "";
    };
    ActionSource.prototype.byteLength = function () {
        return this.isUsed ? 1 /*JUMPDEST*/ : 0;
    };
    ActionSource.prototype.setIsUsed = function () {
        this.isUsed = true;
    };
    return ActionSource;
}(Hexable));
exports.ActionSource = ActionSource;
var ActionPointer = /** @class */ (function (_super) {
    __extends(ActionPointer, _super);
    function ActionPointer(actionSource) {
        var _this = _super.call(this) || this;
        _this.actionSource = actionSource;
        return _this;
    }
    ActionPointer.prototype.toHex = function (executedCodeContext, jumpDestinations) {
        return (0, helpers_1.leftPad)(jumpDestinations[this.actionSource.actionIndex].toString(16), helpers_1.POINTER_BYTE_LENGTH);
    };
    ActionPointer.prototype.byteLength = function () {
        return helpers_1.POINTER_BYTE_LENGTH;
    };
    return ActionPointer;
}(Hexable));
exports.ActionPointer = ActionPointer;
var ConcatedHexValue = /** @class */ (function (_super) {
    __extends(ConcatedHexValue, _super);
    function ConcatedHexValue() {
        var items = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            items[_i] = arguments[_i];
        }
        var _this = _super.call(this) || this;
        _this.items = [];
        _this.items = items;
        return _this;
    }
    ConcatedHexValue.prototype.toHex = function (executedCodeContext, jumpDestinations) {
        var bytecode = this.items
            .map(function (item) { return (0, helpers_1.translateToBytecode)(item, executedCodeContext, jumpDestinations); })
            .join("");
        return bytecode;
    };
    ConcatedHexValue.prototype.byteLength = function () {
        var length = 0;
        this.items.forEach(function (item) {
            length += (0, helpers_1.byteLength)(item);
        });
        return length;
    };
    return ConcatedHexValue;
}(Hexable));
exports.ConcatedHexValue = ConcatedHexValue;
// Refer to the HexableValue type for what should be allowed.
function _sanitizeHexable(input) {
    if (input instanceof Hexable || typeof input == "bigint") {
        return input;
    }
    if (typeof input == "number" || (typeof input == "string" && input.indexOf("0x") == 0)) {
        return BigInt(input);
    }
    return null;
}
function _sanitizeExpression(input) {
    var asHexable = _sanitizeHexable(input);
    if (!!asHexable) {
        return asHexable;
    }
    if (typeof input == "string" || typeof input == "boolean") {
        return input;
    }
    return null;
}
function sanitize(input, functionName, isValue) {
    if (isValue === void 0) { isValue = false; }
    if (typeof input == "undefined") {
        return undefined;
    }
    var sanitized;
    if (isValue) {
        sanitized = _sanitizeHexable(input);
        if ((0, helpers_1.byteLength)(sanitized) > 32) {
            throw new Error("Function " + functionName + "() cannot accept values larger than 32 bytes.");
        }
    }
    else {
        sanitized = _sanitizeExpression(input);
    }
    if (typeof sanitized != "undefined") {
        return sanitized;
    }
    else {
        throw new Error("Function " + functionName + "() cannot accept value of: " + input + ". If you're jumping to a named code location with jump(), use jump($ptr('name')).");
    }
}
exports.sanitize = sanitize;
