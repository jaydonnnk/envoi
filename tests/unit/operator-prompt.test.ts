import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { promptHidden } from "@/operator/cli";

// A fake terminal: create-merchant's password prompt reads raw keystrokes from it (S26).
function fakeTerminal(isTTY = true) {
  const input = Object.assign(new EventEmitter(), {
    isTTY,
    setRawMode: () => input,
    setEncoding: () => input,
    pause: () => input,
    resume: () => input,
  });
  const written: string[] = [];
  return { input: input as never, output: { write: (text: string) => written.push(text) > 0 }, written, type: (text: string) => input.emit("data", text) };
}

describe("operator password prompt", () => {
  it("drops the bracketed paste markers a terminal wraps around a pasted password", async () => {
    const terminal = fakeTerminal();
    const answer = promptHidden("Password: ", terminal.input, terminal.output);
    terminal.type("\u001b[200~correct-");
    terminal.type("horse-42\u001b[201~\r");
    expect(await answer).toBe("correct-horse-42");
    expect(terminal.written.join("")).not.toContain("correct");
  });

  it("drops a paste marker split across two reads", async () => {
    const terminal = fakeTerminal();
    const answer = promptHidden("Password: ", terminal.input, terminal.output);
    terminal.type("\u001b[20");
    terminal.type("0~correct-horse-42\u001b[2");
    terminal.type("01~\r");
    expect(await answer).toBe("correct-horse-42");
  });

  it("keeps a typed password with backspace edits", async () => {
    const terminal = fakeTerminal();
    const answer = promptHidden("Password: ", terminal.input, terminal.output);
    terminal.type("correct-horse-43\u007f2\r");
    expect(await answer).toBe("correct-horse-42");
  });

  it("refuses when stdin is not a terminal", async () => {
    const terminal = fakeTerminal(false);
    await expect(promptHidden("Password: ", terminal.input, terminal.output)).rejects.toThrow("run it interactively");
  });
});
