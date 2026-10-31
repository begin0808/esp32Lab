import { beforeEach, describe, expect, it } from "vitest";
import "../fake-board.js";
import { byteChecksum, pythonBytesLiteral, RawRepl, ReplExecError, ReplTimeoutError, type ByteIO } from "../../src/repl";

declare const FakeBoard: any;

function connect(options?: object) {
  const board = new FakeBoard(options);
  let sink: (data: Uint8Array) => void = () => {};
  const io: ByteIO = {
    write: async (data) => board.receive(data),
    setSink: (next) => {
      sink = next;
    },
  };
  board.onOutput = (data: Uint8Array) => sink(data);
  const repl = new RawRepl(io);
  repl.attach();
  return { board, repl };
}

describe("pythonBytesLiteral", () => {
  it("escapes quotes, backslashes and non-ASCII bytes", () => {
    const literal = pythonBytesLiteral(new TextEncoder().encode("a'\\\n溫"));
    expect(literal).toBe("b'a\\x27\\x5c\\x0a\\xe6\\xba\\xab'");
  });
});

describe("byteChecksum", () => {
  it("wraps at 16 bits", () => {
    expect(byteChecksum(new Uint8Array(300).fill(255))).toBe((300 * 255) & 0xffff);
  });
});

describe("RawRepl", () => {
  let session: ReturnType<typeof connect>;

  beforeEach(() => {
    session = connect();
  });

  it("reads board information", async () => {
    await session.repl.enter();
    const info = await session.repl.readBoardInfo();
    expect(info).toEqual({ release: "v1.29.0", machine: "Generic ESP32 module with ESP32", flashBytes: 4194304 });
  });

  it("uploads UTF-8 code longer than one chunk without changing it", async () => {
    const code = '# 溫濕度 it\'s "quoted" \\ backslash\n'.repeat(60);
    await session.repl.enter();
    const seen: number[] = [];
    await session.repl.writeFile("/main.py", new TextEncoder().encode(code), (fraction) => seen.push(fraction));
    expect(session.board.files["/main.py"]).toBe(code);
    expect(seen.at(-1)).toBe(1);
    expect(seen.length).toBeGreaterThan(1);
  });

  it("uploads an empty file", async () => {
    await session.repl.enter();
    await session.repl.writeFile("/main.py", new Uint8Array(0));
    expect(session.board.files["/main.py"]).toBe("");
  });

  it("reports a Python exception from the board", async () => {
    await session.repl.enter();
    await expect(session.repl.exec("__fail__")).rejects.toBeInstanceOf(ReplExecError);
  });

  it("times out when the board has no MicroPython", async () => {
    const { repl } = connect({ hasMicroPython: false });
    await expect(repl.enter(50, 2)).rejects.toBeInstanceOf(ReplTimeoutError);
  });

  it("keeps the old program when verification fails", async () => {
    session.board.files["/main.py"] = "old";
    const originalRun = session.board.run.bind(session.board);
    session.board.run = (code: string) => {
      if (code.includes("readinto")) session.board.emit("1|1\r\n\x04\x04>");
      else originalRun(code);
    };
    await session.repl.enter();
    await expect(session.repl.writeFile("/main.py", new TextEncoder().encode("new"))).rejects.toThrow("驗證失敗");
    expect(session.board.files["/main.py"]).toBe("old");
  });
});
