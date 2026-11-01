import { describe, expect, it } from "vitest";
import { CommandHistory, enterAction, nextIndent, parseCompletion } from "../../src/command";
import { pasteModeBytes } from "../../src/repl";

describe("CommandHistory", () => {
  it("walks back and forward and returns the unsent text", () => {
    const history = new CommandHistory();
    history.add("first");
    history.add("second");
    expect(history.previous("draft")).toBe("second");
    expect(history.previous("second")).toBe("first");
    expect(history.previous("first")).toBeNull();
    expect(history.next()).toBe("second");
    expect(history.next()).toBe("draft");
    expect(history.next()).toBeNull();
  });

  it("skips empty commands and immediate repeats, and starts over after sending", () => {
    const history = new CommandHistory();
    history.add("");
    expect(history.previous("")).toBeNull();
    history.add("same");
    history.add("same");
    expect(history.previous("")).toBe("same");
    expect(history.previous("same")).toBeNull();
    history.add("other");
    expect(history.previous("")).toBe("other");
  });

  it("keeps only the newest commands", () => {
    const history = new CommandHistory();
    for (let i = 0; i < 60; i++) history.add(`c${i}`);
    let oldest = "";
    for (let step = history.previous(""); step !== null; step = history.previous(step)) oldest = step;
    expect(oldest).toBe("c10");
  });
});

describe("enterAction and nextIndent", () => {
  it("runs a single line and continues a block", () => {
    expect(enterAction("print(1)")).toBe("send");
    expect(enterAction("")).toBe("send");
    expect(enterAction("for i in range(3):")).toBe("newline");
    expect(enterAction("for i in range(3):\n    print(i)")).toBe("newline");
    expect(enterAction("for i in range(3):\n    print(i)\n    ")).toBe("send");
    expect(enterAction("a = 1\nb = 2\n")).toBe("send");
  });

  it("does not mistake a colon inside a line for a block", () => {
    expect(enterAction('print("a:b")')).toBe("send");
  });

  it("indents after a colon and keeps the indent otherwise", () => {
    expect(nextIndent("for i in range(3):")).toBe("    ");
    expect(nextIndent("for i in range(3):\n    if i:")).toBe("        ");
    expect(nextIndent("for i in range(3):\n    print(i)")).toBe("    ");
    expect(nextIndent("print(1)")).toBe("");
  });
});

// These replies were recorded from a real MicroPython REPL.
describe("parseCompletion", () => {
  it("takes a single completion", () => {
    expect(parseCompletion("impor", "import ")).toEqual({ line: "import ", choices: [] });
  });

  it("lists several choices and keeps the line", () => {
    const reply = "sys.std\r\nstderr          stdin           stdout\r\n>>> sys.std";
    expect(parseCompletion("sys.std", reply)).toEqual({ line: "sys.std", choices: ["stderr", "stdin", "stdout"] });
  });

  it("reads choices spread over several rows", () => {
    const reply = "sys.\r\nargv            atexit\r\nexecutable      exit\r\n>>> sys.";
    expect(parseCompletion("sys.", reply).choices).toEqual(["argv", "atexit", "executable", "exit"]);
  });

  it("leaves the line alone when nothing matches or nothing comes back", () => {
    expect(parseCompletion("zzzq", "zzzq")).toEqual({ line: "zzzq", choices: [] });
    expect(parseCompletion("zzzq", "")).toEqual({ line: "zzzq", choices: [] });
  });
});

describe("pasteModeBytes", () => {
  it("wraps a block in paste mode with the board's line ending", () => {
    const text = new TextDecoder().decode(pasteModeBytes("for i in range(2):\n    print(i)\n\n"));
    expect(text).toBe("\x05for i in range(2):\r    print(i)\r\x04");
  });

  it("keeps Chinese text intact", () => {
    expect(new TextDecoder().decode(pasteModeBytes('print("溫度")'))).toContain('print("溫度")');
  });
});
