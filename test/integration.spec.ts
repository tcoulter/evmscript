import Ganache from "ganache-core";
import { preprocess } from "../src";
import { ethers } from "ethers";
import expect from "expect"; 

async function deployCodeAndCall(
  code:string, 
  signer:ethers.providers.JsonRpcSigner, 
  provider:ethers.providers.JsonRpcProvider
):Promise<[string, ethers.providers.TransactionReceipt]> {
  let bytecode = preprocess(code);

  let tx = await signer.sendTransaction({data: bytecode})
  let receipt = await provider.getTransactionReceipt(tx.hash);
  expect(receipt.contractAddress).toBeDefined()

  // If you need debugging, uncomment: 
  // 
  // tx = await signer.sendTransaction({
  //   to: receipt.contractAddress
  // });

  // Let's call it ourselves
  let result = await signer.call({
    to: receipt.contractAddress
  });

  return [result, receipt];
}

describe("Integration", () => {
  let ganacheProvider;
  let provider:ethers.providers.JsonRpcProvider;
  let signer:ethers.providers.JsonRpcSigner; 

  before(async function() {
    ganacheProvider = Ganache.provider();
    // Swap the providers here if you want to run tests against a local ganache
    provider = new ethers.providers.Web3Provider(ganacheProvider)    
    //provider = new ethers.providers.JsonRpcProvider();
    await provider.ready;

    signer = provider.getSigner();
  })

  after((done) => {
    ganacheProvider.close(done);
  })

  it("should deploy and execute a basic deployable script", async function () {
    this.timeout(5000);

    let code = `
      $set("deployable", true);

      msize()     // push mem pointer
      
      push(42)    // store 42 in memory at offset
      dup2()      // copy mem pointer
      mstore()    // do the actual storing

      push(32)     // return 32 bytes
      dup2()      // copy mem pointer again
      ret()       // return 42
    `

    let [result] = await deployCodeAndCall(code, signer, provider);

    // This will return a full 32 bytes, padded. 
    // We just let bigint remove it. 
    expect(BigInt(result).toString(10)).toBe("42");
  })

  it("allocates memory correctly using alloc() (input < 32 bytes)", async () => {
    let code = `
      $set("deployable", true)

      alloc("0x12345") // Note: 3 bytes, will be left padded to 012345
      ret()
    `

    let [result] = await deployCodeAndCall(code, signer, provider);

    expect(result).toBe("0x012345");
  })

  it("allocates memory correctly using alloc() (input > 32 bytes)", async () => {
    let code = `
      $set("deployable", true)

      alloc("0x1000111122223333444455556666777788889999AAAABBBBCCCCDDDDEEEEFFFF0001")
      ret()
    `
    let [result] = await deployCodeAndCall(code, signer, provider);

    expect(BigInt(result).toString(16).toUpperCase()).toBe("1000111122223333444455556666777788889999AAAABBBBCCCCDDDDEEEEFFFF0001");
  })

  // Note: We don't have an allocUnsafe() test for < 32 bytes because the
  // algorithm is the same regardless of input size.
  it("allocates memory correctly using allocUnsafe() (input > 32 bytes)", async () => {
    let code = `
      $set("deployable", true)

      allocUnsafe("0x1000111122223333444455556666777788889999AAAABBBBCCCCDDDDEEEEFFFF0001")
      ret()
    `
    let [result] = await deployCodeAndCall(code, signer, provider);

    expect(BigInt(result).toString(16).toUpperCase()).toBe("1000111122223333444455556666777788889999AAAABBBBCCCCDDDDEEEEFFFF0001");
  })

  it("uses less gas using allocUnsafe() vs. alloc(), which is the whole point!", async () => {
    let data = "0x1000111122223333444455556666777788889999AAAABBBBCCCCDDDDEEEEFFFF0001";

    let safeCode = `
      $set("deployable", true)

      alloc("${data}")
      ret()
    `

    let unsafeCode = `
      $set("deployable", true)

      allocUnsafe("${data}")
      ret()
    `

    let [, safeReceipt] = await deployCodeAndCall(safeCode, signer, provider);
    let [, unsafeReceipt] = await deployCodeAndCall(unsafeCode, signer, provider);

    let safeGasUsed = safeReceipt.gasUsed.toNumber();
    let unsafeGasUsed = unsafeReceipt.gasUsed.toNumber();

    expect(unsafeGasUsed).toBeLessThan(safeGasUsed);
  })

  it("should revert if Ether sent during deployment", async () => {
    let code = `
      $set("deployable", true)

      alloc($hex("hello"))
      ret()
    `

    let bytecode = preprocess(code);
    let error:Error;

    try {
      let tx = await signer.sendTransaction({
        data: bytecode,
        value: 0x1 // 1 wei
      })

      console.log("Transaction didn't error!", tx);
    } catch (e) {
      error = e;
    }
    
    expect(error).toBeDefined();
    expect(error.message).toContain("VM Exception while processing transaction: revert")
  })

  it("alloc's automatically if data passed to revert", async () => {
    // Note: This is non-deployable. We're just gonna execute code passed in.
    // Also note: I used this site as an oracle: https://github.com/graphprotocol/support/issues/21
    let code = `
      revert($hex("Price is not valid"))
    `

    let bytecode = preprocess(code);
    let error:Error;

    try {
      let tx = await signer.sendTransaction({
        data: bytecode
      })

      console.log("Transaction didn't error!", tx);
    } catch (e) {
      error = e;
    }
    
    expect(error).toBeDefined();
    expect(error.message).toContain("Price is not valid")
  })

  it("pushes the correct calldata offsets, first at top of stack", async () => {
    let code = `
      $set("deployable", true)

      pushCallDataOffsets("uint", "bytes")

      allocStack(3)
      ret()
    `

    let bytecode = preprocess(code);

    let tx = await signer.sendTransaction({data: bytecode})
    let receipt = await provider.getTransactionReceipt(tx.hash);
    expect(receipt.contractAddress).toBeDefined();

    let contract = new ethers.Contract(receipt.contractAddress, [
      "function getOffsets(uint, bytes) public returns(uint, uint, uint)"
    ], signer);

    let value:Array<ethers.BigNumber> = await contract.callStatic.getOffsets(5, ethers.BigNumber.from("0x123456")); 

    // The call data for this call is the following:
    // 
    // 0 - 3:     bd3a5abd                                                            // 4 byte function identifier
    // 4 - 35:    0000000000000000000000000000000000000000000000000000000000000005    // value of uint
    // 36 - 67:   0000000000000000000000000000000000000000000000000000000000000040    // location in calldata of bytes
    // 68 - 99:   0000000000000000000000000000000000000000000000000000000000000003    // byte length of bytes
    // 100 - 31:  1234560000000000000000000000000000000000000000000000000000000000    // data of bytes

    expect(value.length).toBe(3)
    expect(value[0].toNumber()).toBe(5)     // For uint, we push the value
    expect(value[1].toNumber()).toBe(100)   // For bytes, we push [data offset, length, ...]
    expect(value[2].toNumber()).toBe(3)   
  })

  it("dispatches functions properly", async () => {
    // I used the function name getLauncherTemplateId() because
    // I found it within the 4-byte directory (a good oracle), and 
    // it was something I could write in a test. 
    // https://www.4byte.directory/signatures/

    let code = `
      $set("deployable", true)

      // Note that I include the variable names here to show that they're
      // properly ignored when calculating the 4-byte hash. Also, I prefix
      // the input with the word "function", which ethers doesn't like, 
      // simply so the user can copy and paste their signature.
      dispatch({
        "function getLauncherTemplateId(address _addr) returns (address _returnAddr)": $ptr("returnAddress")
      })

      // If it doesn't dispatch correctly, we'll return a bad value
      push("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF") // F, for failure
      allocStack(1)
      ret()

      returnAddress = 
        push("0x1234567890123456789012345678901234567890")
        allocStack(1)
        ret()
    `

    let bytecode = preprocess(code);

    let tx = await signer.sendTransaction({data: bytecode})

    let receipt = await provider.getTransactionReceipt(tx.hash);
    expect(receipt.contractAddress).toBeDefined();

    let contract = new ethers.Contract(receipt.contractAddress, [
      "function getLauncherTemplateId(address) public returns(address)"
    ], signer);

    // Input to this function doesn't matter for the test.
    let value:ethers.BigNumber = await contract.callStatic.getLauncherTemplateId("0x1111222233334444555566667777888899990000"); 

    expect(value.toString()).toBe("0x1234567890123456789012345678901234567890");
  })

})