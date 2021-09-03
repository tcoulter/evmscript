import { preprocess } from "../src"
import expect from "expect";

describe("Errors", () => {

  it("gives proper line numbers on syntax errors", () => {
    let code = `push("hello")` // push shouldn't accept string input

    try {
      preprocess(code);
    } catch (e) {
      if (e instanceof Error) {
        let lastLine = e.stack.split(/\r?\n/).reverse()[0];
        expect(lastLine).toContain("at bytecode:1:1");
      } else {
        throw new Error("Unknown error received: " + e);
      }
    }
  })

})