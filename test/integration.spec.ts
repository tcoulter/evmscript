import Ganache from "ganache-core";
import { preprocess } from "../src";
import { ethers } from "ethers";
import expect from "expect"; 

describe("Integration", () => {
  let ganacheProvider;
  let provider:ethers.providers.JsonRpcProvider;

  before(async function() {
    ganacheProvider = Ganache.provider();
    //provider = new ethers.providers.Web3Provider(ganacheProvider)    
    provider = new ethers.providers.JsonRpcProvider();
    await provider.ready;
  })

  after((done) => {
    ganacheProvider.close(done);
  })

  it("should deploy and execute a basic deployable script", async function () {
    this.timeout(5000);

    let code = `
      $set("deployable", true);

      getmem()    // push mem pointer
      
      push(42)    // store 42 in memory at offset
      dup2()      // copy mem pointer
      mstore()    // do the actual storing

      push(32)    // return 32 bytes
      dup2()      // copy mem pointer again
      ret()       // return 42
    `

    let bytecode = preprocess(code);

    let signer = provider.getSigner();

    let tx = await signer.sendTransaction({
      data: bytecode
    })

    let receipt = await provider.getTransactionReceipt(tx.hash);

    expect(receipt.contractAddress).toBeDefined()

    // Now lets call a function against the contract address
    // Our bytecode returns 42 regardless, but we'll still use 
    // ethers to send the transaction like it was Solidity.

    let contract = new ethers.Contract(receipt.contractAddress, [
      "function get42() public pure returns(uint)"
    ], signer);

    let value:ethers.BigNumber = await contract.get42(); 

    expect(value.toNumber()).toBe(42);
  })

})