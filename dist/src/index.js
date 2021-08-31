"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.preprocessFile = exports.preprocess = exports.RuntimeContext = void 0;
var vm_1 = __importDefault(require("vm"));
var fs_1 = __importDefault(require("fs"));
var path_1 = __importDefault(require("path"));
var actions_1 = require("./actions");
var grammar_1 = require("./grammar");
var helpers_1 = require("./helpers");
var RuntimeContext = /** @class */ (function () {
    function RuntimeContext() {
        this.deployable = false;
        this.intermediate = [];
        this.actionIndex = -1;
    }
    RuntimeContext.prototype.getActionSource = function () {
        this.actionIndex += 1;
        return new grammar_1.ActionSource(this.actionIndex);
    };
    return RuntimeContext;
}());
exports.RuntimeContext = RuntimeContext;
function preprocess(code, extraContext) {
    if (extraContext === void 0) { extraContext = {}; }
    var runtimeContext = new RuntimeContext();
    // Set some custom context functions, taking in what's passed by the user
    var codeContext = __assign({}, extraContext);
    var nonActionFunctions = __assign(__assign({}, actions_1.expressionFunctions), actions_1.contextFunctions);
    // Create a prefix for internal functions so there's no collision.
    // As you can tell, we're not messing around. We declare action functions, etc.,
    // as internal functions within the codeContext, so that we can declare
    // const versions of those functions *within* the code, preventing the user
    // from redefining "built in" functions.
    var internalFunctionPrefix = "__internal__$$__" + new Date().getTime();
    Object.keys(actions_1.actionFunctions)
        .filter(function (key) { return typeof actions_1.actionFunctions[key] == "function"; })
        .map(function (key) { return [key, (0, helpers_1.createActionHandler)(runtimeContext, key, actions_1.actionFunctions[key])]; })
        .forEach(function (_a) {
        var key = _a[0], fn = _a[1];
        return codeContext[internalFunctionPrefix + key] = fn;
    });
    Object.keys(nonActionFunctions)
        .filter(function (key) { return typeof nonActionFunctions[key] == "function"; })
        .map(function (key) { return [key, (0, helpers_1.createExpressionAndContextHandlers)(runtimeContext, key, nonActionFunctions[key])]; })
        .forEach(function (_a) {
        var key = _a[0], fn = _a[1];
        return codeContext[internalFunctionPrefix + key] = fn;
    });
    // Add default functions for instructions without set functions
    // This will take the instruction names and lower case them,
    // returning a function that simply returns the instruction.
    var reservedWords = { "return": "ret" };
    // Create default functions for any instructions that don't have 
    // already defined action functions. 
    Object.keys(grammar_1.Instruction)
        .filter(function (key) { return isNaN(parseInt(key)); }) // enums have numeric keys too; filter those out
        .filter(function (key) { return !actions_1.actionFunctions[key.toLowerCase()]; }) // filter out instructions with named actions
        .map(function (key) {
        var lowercaseKey = key.toLowerCase();
        if (reservedWords[lowercaseKey]) {
            lowercaseKey = reservedWords[lowercaseKey];
        }
        return [
            lowercaseKey,
            (0, helpers_1.createActionHandler)(runtimeContext, lowercaseKey, function () {
                runtimeContext.intermediate.push(grammar_1.Instruction[key]);
            })
        ];
    })
        .forEach(function (_a) {
        var key = _a[0], fn = _a[1];
        return codeContext[internalFunctionPrefix + key] = fn;
    });
    // Translate all internalFunctionPrefix'd keys to having the underscore removed, by adding
    // a preamble to the code. This ensures the user will receive an error if they
    // accidentally define a function of the same name. 
    Object.keys(codeContext).forEach(function (key) {
        if (key.indexOf(internalFunctionPrefix) >= 0) {
            var nonPrefixedKey = key.replace(internalFunctionPrefix, "");
            code = "const " + nonPrefixedKey + " = this." + key + ";" + code;
        }
    });
    //// Run a first pass, which evaluates the input and turns it into
    //// an intermediate representation.
    vm_1.default.runInNewContext(code, codeContext);
    // Note: After execution, node can set values of any type to the context,
    // so we can't rely on types here. Let's make that explicit.
    var executedCodeContext = codeContext;
    // Explore the codeContext for any variables of type ActionPointer.
    // If they exist, it means a jumpable label was set in the code.
    // Let's updated the associated ActionSource and mark it as used. 
    // This will ensure a JUMPDEST gets added in its place.
    Object.keys(executedCodeContext)
        .filter(function (key) { return executedCodeContext[key] instanceof grammar_1.ActionPointer; })
        .map(function (key) { return executedCodeContext[key]; })
        .forEach(function (actionPointer) { return actionPointer.actionSource.setIsUsed(); });
    // 1. Compute the byte lengths of each item in the intermediate representation
    // 2. Sum result to determine the total bytes at each index
    // 3. Create a record of ActionSource indeces -> total bytes, as this represents the jump destination 
    var jumpDestinations = {};
    var byteLengths = runtimeContext.intermediate
        .map(function (item) { return (0, helpers_1.byteLength)(item); });
    var sum = 0;
    byteLengths
        .map(function (length) {
        sum += length;
        return sum;
    })
        .forEach(function (totalBytes, index) {
        var item = runtimeContext.intermediate[index];
        if (!(item instanceof grammar_1.ActionSource)) {
            return;
        }
        // Don't include the current byte length as that'll point to the following byte! 
        jumpDestinations[item.actionIndex] = BigInt(totalBytes - byteLengths[index]);
    });
    // Now loop through the intermediate representation translating
    // action pointers and label pointers to their final values.
    var bytecode = [];
    runtimeContext.intermediate.forEach(function (item) {
        var translation = (0, helpers_1.translateToBytecode)(item, executedCodeContext, jumpDestinations);
        if (translation) {
            bytecode.push(translation);
        }
    });
    var output = bytecode.map(function (item) {
        var str = item.toString(16);
        while (str.length % 2 != 0) {
            str = "0" + str;
        }
        return str;
    }).join("");
    if (output.length % 2 != 0) {
        throw new Error("CRITICAL FAILURE: Final value has odd byte offset!");
    }
    output = "0x" + output.toUpperCase();
    // If the code is set to deployable, use our own preprocessor to create
    // a deployer for that code.
    if (runtimeContext.deployable == true) {
        output = preprocessFile(path_1.default.join(__dirname, "./deployer.bytecode"), {
            CODE: output
        });
    }
    return output;
}
exports.preprocess = preprocess;
function preprocessFile(inputFile, extraContext) {
    if (extraContext === void 0) { extraContext = {}; }
    var input = fs_1.default.readFileSync(inputFile, "utf-8");
    return preprocess(input, extraContext);
}
exports.preprocessFile = preprocessFile;
