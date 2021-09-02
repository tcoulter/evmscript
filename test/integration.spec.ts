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

})