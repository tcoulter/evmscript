"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var path_1 = __importDefault(require("path"));
var src_1 = require("./src");
var argv = require('yargs/yargs')(process.argv.slice(2)).argv;
var inputFile = path_1.default.resolve(argv._[0]);
var output = (0, src_1.preprocessFile)(inputFile);
console.log(output);
