import { describe, expect, it } from "vitest";
import { RawRunWatcher } from "../../src/rawrun";

describe("RawRunWatcher", () => {
  it("passes output through until the program ends, then drops the markers once", () => {
    const watcher = new RawRunWatcher();
    expect(watcher.push("LED: 亮\r\n")).toEqual({ text: "LED: 亮\r\n", finished: false });
    expect(watcher.push("done\r\n\x04\x04>")).toEqual({ text: "done\r\n", finished: true });
    // After the end, everything is ordinary output again, such as the prompt once raw REPL is left.
    expect(watcher.push("\x04>>> ")).toEqual({ text: "\x04>>> ", finished: false });
  });

  it("keeps the error text between the markers, so the error card still finds it", () => {
    const watcher = new RawRunWatcher();
    const result = watcher.push('hi\r\n\x04Traceback (most recent call last):\r\n  File "<stdin>", line 2\r\nValueError: bad\r\n\x04>');
    expect(result).toEqual({ text: 'hi\r\nTraceback (most recent call last):\r\n  File "<stdin>", line 2\r\nValueError: bad\r\n', finished: true });
  });

  it("copes with the end split across reads, and with > printed by the program itself", () => {
    const watcher = new RawRunWatcher();
    expect(watcher.push("a > b\r\n\x04")).toEqual({ text: "a > b\r\n", finished: false });
    expect(watcher.push("\x04")).toEqual({ text: "", finished: false });
    expect(watcher.push(">\r\nMicroPython v1.29.0\r\n>>> ")).toEqual({ text: "\r\nMicroPython v1.29.0\r\n>>> ", finished: true });
  });
});
