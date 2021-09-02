# evmscript

Write assembly language applications for the EVM (and EVM-enabled blockchains) using Javascript! 

## What is it? 

`evmscript` is a method of writing "bare-metal" assembly applications for the Ethereum Virtual Machine (EVM) using Javascript. `evmscript` takes advantage of the Javascript interpreter so that you can write commented, multi-line assembly without a hex editor, with all the preprocessing and helper functions you could ever ask for. 

### Example

```javascript
$set("deployable", true)

const TIMES = 5;

push(0) // start index at 0

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
```


## Motivation

It all started because I wanted a "jump map" (at least, that's what I'm calling it), which can best be thought of as an array of jump positions that can be referenced by their index. For gas effeciency reasons, I needed each lookup/jump to have constant gas costs. Here's an example of a jump map, written in `evmscript` of course: 

```javascript

// Imagine the following is loaded into memory at 0x80:
// 
//   00A100B700CF00D100E9...
//   ^   ^   ^   ^   ^--- 4th jump destination
//   |   |   |   -------- 3rd jump destination
//   |   |   ------------ 2nd jump destination
//   |   ---------------- 1st jump destination
//   -------------------- 0th jump destination
//
// Notice every jump destination is two bytes.
// With that in memory, you could then do the following:

push(4)           // 1. Load first call data slot past solidity 4-byte hash.
calldataload()    // This will load the index passed in. It's 2 bytes per
push(0x2)         // index, so take that into account.
mul()             //

push(0x80)        // 2. Calculate the offset for the index based on start of the map.
add()

mload()           // 3. Load 32 bytes from the index offset onto the stack
push(30)          // and get rid of the 30 we don't need.
shr()             //

jump()            // And 4. Viola! Jump to the desired location.

```

Here we jump to the first index found in the call data, but theoretically we could stick this in a loop and process many lookups/jumps.

Of course I didn't intend to create my own EVM scripting mechanism, but [Yul](https://docs.soliditylang.org/en/v0.7.4/yul.html), the most used EVM assembly language baked directly into Solidity, didn't work for me (described below), and there was no way I was going to write straight assembly. Ain't nobody got time for that, especially in a project where needs can change rapidly.

Yul didn't work specifically because of [this quote](https://docs.soliditylang.org/en/v0.7.4/yul.html#motivation-and-high-level-description) (emphasis mine): 

> [...] Yul provides high-level constructs like for loops, if and switch statements and function calls. **These should be sufficient for adequately representing the control flow for assembly programs. Therefore, no explicit statements for SWAP, DUP, JUMPDEST, JUMP and JUMPI are provided**, because the first two obfuscate the data flow and the last two obfuscate control flow.

I disagree with the author on that last point, because (somewhat pedantically) control flow and data flow aren't actually obfuscated in assembly. It's just confusing! Assembly language is by definition confusing to read and understand, and anything we can do simplify things can be a huge boon to program authors. Yul chooses to simplify things via familiar `if`, `switch`, and loop statements, which is definitely helpful but can be limiting in some situations, as mentioned.

## Features

When looking for an alternative beyond Yul, what I quickly realized was that writing straight assembly with the addition of helpful preprocessing functions can make the task a lot easier. I originally set out to solve my needs for a jump map, and after piggy-backing on Javascript's interpreter for translation, the features just kept coming. `evmscript` gives you:

* A generalized `push()` function, which choosed the correct `PUSH*` instruction based on input
* Named jump destinations, and `jump()` and `jumpi()` functions that will calculate the correct jump destination based on the name passed in. As well, named code locations that can be pointed to and resolved during preprocessing (see our own [deployer](./src/deployer.bytecode)).
* Helpful common routines like `alloc()` that loads arbitrarily-sized data into memory (and `allocUnsafe()`, which can do it more cheaply but it comes with some safety tradeoffs). Both `alloc()` and `allocUnsafe()` pair well with `ret()` and `revert()`, teeing up the stack to so you can use those functions directly afterward -- no futzing with pushing large pieces of data, data lengths, and byte shifting. Oh, and do you want to get out quick with no revert message? Use `bail()`!
* Preprocessing-specific functions that can help you craft the right data, such as `$concat()` which concatenates hex values; `$bytelen()` which calculates the byte length of arbitrary input; `$hex()` which can turn string literals into their hexadecimal representation; and `$ptr()` which will give you the bytecode-location of any named code location. 
* Helpers like `$set("deployable", true)`, which add the necessary bytecode to ensure your code creates a deployable contract. 
* Ability to define constants and variables within your code, as well as your own preprocessing functions to greatly reduce copy/paste.
* Wield the full power of Javascript and Node by using environment variables, importing external helper functions, and even using `require()` to import any libraries you might need.

## How does it work?

It's just Javascript! We use the features provided by Node's [`vm` module](https://nodejs.org/api/vm.html) -- effectively a dressed up `eval()` -- to bootstrap your code with functions you need. These functions, like `push()`, build your program's bytecode as they're executed, and give you the ability to do as much preprocessing as you need.

## Usage

First install it:

```
$ npm install evmscript
```

Then, in your code:

```javascript
import {preprocess, preprocessFile} from "evmscript";

// Preprocess a file
let bytecode = preprocessFile("./path/to/file.bytecode", {
  // ... constants/functions to inject in your code
});

// Or, preprocess code directly
let bytecode = preprocess(code, {
  // ... constants/functions to inject in your code
})

// Then use that bytecode in a transaction. This example uses  
// the `ethers` package. We also assume your bytecode is set 
// to deployable.

// Set up ethers
let provider = new ethers.providers.JsonRpcProvider();
let signer = provider.getSigner();

// Deploy the bytecode
let tx = await signer.sendTransaction({
  data: bytecode
})

// Get a receipt so we can record the deployed contract address
let receipt = await provider.getTransactionReceipt(tx.hash);

// Now let's call our code using ethers.
// Here we make up an ABI that will create the call data our bytecode expects.
// We generally recommend you follow Solidity conventions with
// calldata since almost all contracts are written in Solidity.
let contract = new ethers.Contract(receipt.contractAddress, [
  "function myFunc() public pure returns(uint)" // Note: This is dependent on your code
], signer);

let value:ethers.BigNumber = await contract.myFunc();  
// Then do something with the value! 

```

## Examples

TODO. For now, see [the tests](./test).

### Development

Set up:

```
$ git clone git@github.com:tcoulter/evmscript.git
$ cd evmscript
$ npm install
```

Run tests: 

```
$ npm test
```

All code is written in Typescript, including the tests, save for [our own contract deployer](./src/deployer.bytecode) that's written directly in `evmscript`!


## Resources

* ethervm: EVM assembly reference and decompiler. https://ethervm.io/