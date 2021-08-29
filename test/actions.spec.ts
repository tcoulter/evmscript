import expect from "expect";
import { preprocess } from "../src/preprocess";


describe('Preprocessing', function() {
 
  describe("push", () => {
    it("should choose the right push instruction based on input", () => {
      let code = `
        push(0x11)
        push(0x1111)
        push(0x111111)
        // We'll assume that if it gets these three correct, it's good
        // Put for good measure, let's test the last one
        push(0x11111111111111111111111111111111n)  
      `
      let bytecode = preprocess(code);

      expect(bytecode).toBe(
        "0x6011611111621111116f11111111111111111111111111111111"
      )
    })


  })

  describe("pointers & jumps", () => {
    it("should encode pointers into a two byte value", () => {
      let code = `
        someLabel =
          push($ptr("someLabel"))
      `

      let bytecode = preprocess(code);

      expect(bytecode).toBe(
        "0x610000"
      )
    })

    it("should point to the correct location of named pointers when using $ptr() and goto()", () => {
      let code = `
        push(0x01)
        push(0x01)

        someLabel = 
          push(0x01)

        goto($ptr("someLabel"))
      `

      let bytecode = preprocess(code);

      expect(bytecode).toBe(
        "0x60016001600161000456"
      )
    })

    it("should be able to use $ptr() syntax within goto's to jump to a label not yet seen at runtime", () => {
      let code = `
        goto($ptr("main"))

        push(0x01)  // dead code
        push(0x01)  // dead code

        main = 
          push(0x02)
      `

      let bytecode = preprocess(code);

      expect(bytecode).toBe(
        "0x61000856600160016002"
      )
    })

    it("should be able to use the variable syntax to jump to labels already seen at runtime", () => {
      let code = `
        mainloop = 
          push(0x01)
          goto(mainloop)
      `

      let bytecode = preprocess(code);

      expect(bytecode).toBe(
        "0x600161000056"
      )
    })
  })

});