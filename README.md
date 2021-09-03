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
push(240)         // and get rid of the 30 we don't need (bitwise shift).
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

Note for TODO: We should show here how to use Javascript niceties, higher level examples, environment variables, injected variables, etc., and not just function definitions. 

## Function Defintion

The following lists the helper functions available for preprocessing. Each function contains a type, which is either an `Action` or `Expression`, and a definition that describes how it manipulates the stack. Here's how to read this: 

#### Types: 

* `Action`: Adds instructions to the code. Also can manipulate the stack, consuming stack data and/or pushing new values.
* `Expression`: Does not add instructions to the code nor manipulate the stack. Used solely during preprocessing. Expression functions start with `$`.

#### Stack definition: 

Read the stack definition like the following: 

`[consumed stack, ...], <function> => [items added to the stack, ...]`

In these defintiions, the left most data in stack arrays `[]` is the stack top. 

### push(input:HexableValue)

Pushes an arbitrary amount of data (1 to 32 bytes) to the stack. This function will automatically determine the correct `PUSH*` instruction to use based on input data.

Definition: `Action: [], push(input:HexableValue) => [input, ...]`

Input can be of type `number`, `BigInt`, 0x-prefixed `string`, or a code pointer.

```javascript
push(5)                   // number
push(0x1)                 // hex number
push("0x10101010")        // 0x-prefixed string
push(128n)                // bigint

push($ptr("somelabel"))   // Push a code pointer to "somelabel" (see jump())
                          // Will be translated to the correct code location
                          // during preprocessing. 
```

### push<X>(input:HexableValue)

This function is exactly like `push()`, except that it enforces the byte length of the input and errors if the input does not equal the expected length. 

Available values of `X` range from `push1()` to `push32()`.

Definition: `Action: [], push<X>(input:HexableValue) => [input, ...]`

```javascript
push4(0x01020304) // Valid! 
push5(0x01020304) // Errors! Expects 5 bytes.
```

## pushCallDataOffsets(...args:string[])

Accept named solidity types, like `uint` and `bytes` that represent the expected call data, and push the values and offsets to the stack such that the first item in the call data is at the top of the stack. 

Definition: `Action: [], pushCallDataOffsets(item1, ..., itemN) => [(offset1, length1)|value1, ..., (offsetN, lengthN)|valueN]`

Currently supported types (more to come): 

- `uint`
- `bytes`

For non-dynamic types, like `uint`, this function pushes `[value, ...]` to the stack, since there's no data offset or length necessary. For dynamic types like `bytes`, this function pushes `[offset, length, ...]` instead. Note that this function does not load the data of dynamic types - that's up to you and your application. As well, the offset returned for dynamic types is a calldata offset, and not a memory offset, so do not use `ret()` or `revert()` directly afterward.

```javascript
pushCallDataOffsets("uint", "bytes")

// For the calldata representing (5, "0x123456"), you should expect the following stack:
// 
// 0: 000000...000005 (top)  // Value of 5
// 1: 000000...000064        // Calldata offset of bytes data
// 2: 000000...000003        // Length of bytes data
```

See [the integration tests](./test/integration.spec.ts) for an example. 

### alloc(input:HexableValue)

Allocate a preprocessed value in memory using a series of `push()`'s and `mstore()`'s. `input` can be of arbitrary length. Will push the memory offset and the input length to the stack for use after allocation. 

Definition: `Action: [], alloc(input:HexableValue) => [offset, length, ...]`

```javascript
// This example allocates an ABI-encoded string that'll be consumed
// by revert() as a revert reason string (triggered by 0x08c379a0).
// This is only an example - you don't need to do this yourself! 
// See revert() definition.
let ERROR_MESSAGE = $hex("This is an error message!");
alloc(
  $concat(
    "0x08c379a0",                         
    $pad(0x20, 32),
    $pad($bytelen(ERROR_MESSAGE), 32, "right"),
    ERROR_MESSAGE
  )
)
revert()
```

### allocUnsafe(input:HexableValue)

This function does the exact same thing as `alloc()`, except it does so by inserting the input into the resultant bytecode and then using `CODECOPY` to get the data into memory. This is considered unsafe because the input to `allocUnsafe()` will be seen by the EVM as runnable code. Although `allocUnsafe()` will never run the input as code, it is technically possible to jump to any `JUMPDEST`'s contained within the input. `allocUnsafe()` has cheaper gas costs than `alloc()`. When in doubt, use `alloc()`. 

Definition: `Action: [], alloc(input:HexableValue) => [offset, length, ...]`

```javascript
// This is an example deployment script using allocUnsafe().
// Assume CODE is the code being deployed.

assertNonPayable()  // The deployment shouldn't be payable
allocUnsafe(CODE)

// RETURN has everything it needs due to stack output of allocUnsafe()
ret()  
```

### allocStack(input:number) 

Consume and store the top N items from the stack into memory. This will push `[offset, length, ...]` of the memory stored to the stack.

Defintion: `Action: [val1, ..., valN, ...], allocStack(input:number) => [offset, length, ...]`

```javascript
// Example that returns 3 words: 00..03, 00..02, 00..01
push(1)
push(2)
push(3)
allocStack(3)
ret()
```

### jump(input:HexableValue)

Jump to the code location defined by `input`. If none is passed, this function will act as a normal `JUMP` instruction.

The `jump()` function can take arbitrary data as input, as well as code pointers. Use `$ptr()` to jump to named code locations when the location variable hasn't yet been defined during execution of the preprocessor (e.g., when the code location is lower in the code than the jump instruction). You can use the variable itself after it has been defined. See `somelabel` in the example below.

Definitions:
- Using code location: `Action: [], jump(input:HexableValue) => []`
- Normal jump: `Action: [location, ...] jump() => []` 

```javascript
// Jump using a pointer to "somelabel"
jump($ptr("somelabel"))     

somelabel = 
  // ... some code ...

  // Jump using variable reference
  // Remember, this is Javascript. Variable has now been defined.
  jump(somelabel)        
  
// Normal jump
push(0x55)   
jump()    // Pulls 0x55 from stack
```

### jumpi(input:HexableValue)

This works exactly like `jump()` except that this function expects an added conditional value on the stack. 

Definitions: 
- Using code location: `Action: [conditional], jumpi(input:HexableValue) => []`
- Normal jump: `Action: [location, conditional, ...] jumpi() => []` 

```javascript
// Loop example:

push(0) // our index variable

mainloop =
  // ... do something, then check counter

  push(1)     // add 1 to the index
  add()
  push(5)     // push 5 for comparison
  dup2()      // copy the index
  eq()        // consume 5 index and copy; push 1 if equal, 0 if not
  
  jumpi(mainloop)   // jump to mainloop if top of the stack is 1

stop()
```

### dispatch(mapping:Record<solidityFunctionSignature, pointerObject>)

Evaluate the function signature passed within the call data (the first four bytes) and if that value matches a function within the record, jump to the pointer associated with with that function.

This is best shown by example, so see below. That said, `solidityFunctionSignature` is string representation of the function, and `pointerObject` is the return value of `$ptr()`. 

Note that `dispatch()` will not revert if the signature found in calldata doesn't match one provided.

Definition: `Action: [], dispatch(mapping:Record<solidityFunctionSignature, pointerObject>) => []`

```javascript
dispatch({
  "setOwner(address)": $ptr("setOwner"),
  "getOwner()": $ptr("getOwner")
})

setOwner = 
  pushCallDataOffsets()
  // do something...

getOwner = 
  // do something...
```

### insert(input:HexableValue)

This function directly inserts a arbitrary value into the code. It does not check if the inserted value is valid code. This is used under the hood within `allocUnsafe()`, and contains the same safety risks. Use with caution. 

Definition: `Action: [], insert(input:HexableValue) => []`

```javascript
push(0xAA)
insert("0x6001")  // Insert 6001 directly into the code
push(0xBB)

// When run, the above code results in the following bytecode:
// 
// 0x60AA600160BB
//       ^^^^     -> Directly inserted
//   ^^^^    ^^^^ -> Filler for example purposes
```

### revert(input:HexableValue)

Revert, causing the transaction to error. When `input` is defined, `revert()` will construct an ABI-encoded revert reason string using the `input` that external callers can underestand. When no `input` is given, this function is treated as a normal `REVERT` instruction. 

Definitions:
- When reason string is passed: `Action: [], revert(input:HexableValue) => []`
- Normal revert: `Action: [offset, length, ...] revert() => []`

```javascript
// Will send "Bad input!" as the revert reason string
revert($hex("Bad input!"))

// Normal revert, passing no data
push(0)
dup(1)
revert()
```

### bail()

This is a simple helper that reverts with no reason string. 

Definition: `Action: [], bail() => []`

```javascript
bail() // revert! 

// bail() is equivalent to:
push(0)
dup(1)
revert()
```

### assertNonPayable(input:HexableValue)

Will revert if Ether has been sent to the transaction. If `input` is passed, it'll be used as the revert reason string. See `revert()`. 

Definitions: 
- `Action: [], assertNonPayable(input:Hexable) => []`
- `Action: [], assertNonPayable() => []`

```javascript
assertNonPayable("Do not send Ether!");

// This is equivalent to: 

callvalue()       // Jump to allgood if no Ether
iszero()           
jumpi($ptr("allgood"))   
revert("Do not send Ether!")    // Ether passed? Revert!           

allgood = 
  // ... continue onward

```

### shr(input:HexableValue) / shl(input:HexableValue)

Both `shr()` and `shl()` are helpers for the right and left shift operations, respectively. When no value is passed they act like normal `SHR` and `SHL` instructions, consuming data from the stack. When a value is passed, the passed value is pushed to the stack and then used normally. 

These function accept a value purely for readability and reducing lines of code. 

Definitions: 
- `Action: [shift amount, value, ...] shr() / shl() => [shifted value, ...]`
- `Action: [value, ...] shr(input:HexableValue) / shl(input:HexableValue) => [shifted value, ...]`

```javascript
// The following are equivalent

// 1. Normal SHR
push(1)   // value
push(8)   // shift by 1 byte (8 bits)
shr()

// 2. Helper version
push(1)   // value
shr(8)    // shift by 1 byte (8 bits)
```

### calldataload(offset:HexableValue, length:number = 32)

This is a helper function for loading specific data from calldata. When no value for `offset` is passed, this function acts like a normal `CALLDATALOAD` instruction. However, when `offset` is passed, `calldataload()` will load 32 bytes of data from calldata starting at the passed offset. When length is set and is less than 32, this function will shift the loaded data to include only the bytes from `offset` to `offset + length`. The resultant data is left padded. See example. 

Definition: 
- `Action: [offset], calldataload() => [msg.data[offset]..msg.data[offset+32], ...]`
- `Action: [], calldataload(offset) => [msg.data[offset]..msg.data[offset+32]]`
- `Action: [], calldataload(offset, length) => [msg.data[offset]..msg.data[offset+length]]`

```javascript
// Load the solidity 4-byte function signature (note length of 4)
calldataload(0, 4)

// Stack:
// 0: 00000000...1b22f9c5 (top) 

// Know there's a uint as the first param? Load it yourself
calldataload(4)

// Stack now: 
// 0: 00000000...00000005 (top)
// 1: 00000000...1b22f9c5         // Function signature previously loaded

```

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