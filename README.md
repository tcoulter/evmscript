# evmscript

Write assembly language applications for the EVM (and EVM-enabled blockchains) using Javascript! 

## What is it? 

EVMScript is a method of writing "bare-metal" assembly applications for the Ethereum Virtual Machine (EVM) using Javascript. EVMScript takes advantage of the Javascript interpreter so that you can write commented, multi-line assembly without a hex editor, with all the preprocessing and helper functions you could ever ask for. 

### Example

```javascript
$set("deployable", true)

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
```


## FAQ

### Why did you create `evmscript`? Doesn't YUL work? 

**TL;DR:** I wanted a jump map, which jumps to a specific spot based on call data. Here's an example jump map in `evmscript`: 

```javascript
getmem()                            // get free memory pointer, to use as jump map offset
push32(                             // push jump map
  $rightpad(
    $concat(
      $ptr("destination_one"),      // byte 0 of value, from left
      $ptr("destination_two"),      // byte 2 of value, from left
      $ptr("destination_three"),    // byte 4 of value, from left
      // ...
    ),
    32
  )
)
dup2()                              // copy jump map offset
mstore()                            // store jump map at offset

push(4)                             // load first call data slot past solidity 4-byte hash
calldataload()    
dup2()                              // copy jump map offset (again) and add to jump map offset
add()                               // to calculate the index offset 

mload()                             // load jump ptr (and 30 other bytes) at index offset
push(30)                            // get rid of the 30 other bytes
shr()                               
jump()                              // jump to destination within the jump map at the index! 


destination_one = 
  // ...
destination_two = 
  // ...
destination_three = 
  // ...

// ... more jump destinations ...

```



## Resources

* ethervm: EVM assembly reference and decompiler. https://ethervm.io/