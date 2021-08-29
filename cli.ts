import path from "path";
import { preprocessFile } from "./src/preprocess";
var argv = require('yargs/yargs')(process.argv.slice(2)).argv;

let inputFile = path.resolve(argv._[0]);

let output = preprocessFile(inputFile);

console.log(output);

