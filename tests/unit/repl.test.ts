import { beforeEach, describe, expect, it } from "vitest";
import "../fake-board.js";
import { RawRepl, ReplExecError, ReplTimeoutError, sha256Hex, toBase64, type ByteIO } from "../../src/repl";

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

describe("toBase64", () => {
  it("encodes any bytes, including UTF-8 text", () => {
    expect(toBase64(new TextEncoder().encode("溫"))).toBe("5rqr");
    expect(toBase64(Uint8Array.of(0, 255, 39, 92))).toBe("AP8nXA==");
    expect(toBase64(new Uint8Array(0))).toBe("");
  });
});

describe("sha256Hex", () => {
  it("matches the known digest of a short text", async () => {
    expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
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

  it("sends commands in raw-paste mode without outrunning the board", async () => {
    const code = "# 溫濕度\n".repeat(700);
    await session.repl.enter();
    await session.repl.writeFile("/main.py", new TextEncoder().encode(code));
    expect(session.board.files["/main.py"]).toBe(code);
    expect(session.repl.usedRawPaste).toBe(true);
    expect(session.board.overflow).toBe(false);
  });

  it("needs only a few round trips for a large program", async () => {
    // About the size of the largest example, with Chinese comments.
    const data = new TextEncoder().encode("print('LED')  # 讀目前的狀態，再改成相反\n".repeat(110));
    expect(data.length).toBeGreaterThan(5000);
    await session.repl.enter();
    await session.repl.writeFile("/main.py", data);
    // Open, 3 pieces, close, verify and rename. With 256-byte pieces it took 26.
    expect(session.board.execs).toBe(7);
  });

  for (const rawPaste of ["off", "unknown"]) {
    it(`falls back to plain raw REPL when raw-paste mode is ${rawPaste}`, async () => {
      const { board, repl } = connect({ rawPaste });
      const code = "# 溫濕度 it's \\ fine\n".repeat(200);
      await repl.enter();
      await repl.writeFile("/main.py", new TextEncoder().encode(code));
      expect(board.files["/main.py"]).toBe(code);
      expect(repl.usedRawPaste).toBe(false);
      // Asked once, then remembered for the rest of the session.
      const asked = board.received.filter((byte: number, index: number, all: number[]) => byte === 0x05 && all[index + 1] === 0x41).length;
      expect(asked).toBe(1);
    });
  }

  it("uploads an empty file", async () => {
    await session.repl.enter();
    await session.repl.writeFile("/main.py", new Uint8Array(0));
    expect(session.board.files["/main.py"]).toBe("");
  });

  it("reports a Python exception from the board", async () => {
    await session.repl.enter();
    await expect(session.repl.exec("__fail__")).rejects.toBeInstanceOf(ReplExecError);
  });

  it("soft resets from raw REPL without running main.py, and stays in raw REPL", async () => {
    session.board.files["/main.py"] = "print(1)\n";
    await session.repl.enter();
    await session.repl.softReset();
    expect(session.board.rawSoftResets).toBe(1);
    expect(session.board.mode).toBe("raw");
    expect(await session.repl.exec("x = 1")).toBe("");
  });

  for (const rawPaste of ["on", "off"]) {
    it(`starts a program and leaves its output unread, with raw-paste mode ${rawPaste}`, async () => {
      const { board, repl } = connect({ rawPaste });
      await repl.enter();
      await repl.send('print("第一行")\nwhile True:\n    pass');
      expect(board.mode).toBe("running");
      expect(new TextDecoder().decode(repl.takeUnread())).toBe("第一行\r\n");
      expect(repl.takeUnread().length).toBe(0);
      expect(board.files["/main.py"]).toBeUndefined();
    });
  }

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
    // The temporary file does not linger.
    expect(session.board.tempData).toBeNull();
  });
});

describe("board files", () => {
  let session: ReturnType<typeof connect>;

  beforeEach(async () => {
    session = connect();
    session.board.files["/main.py"] = "print(1)\n";
    session.board.files["/boot.py"] = "# boot\n";
    session.board.dirs.add("/lib");
    session.board.files["/lib/ssd1306.py"] = "# 顯示器\n";
    await session.repl.enter();
  });

  it("lists a folder with sizes and the space left", async () => {
    expect(await session.repl.listDir("/")).toEqual({
      entries: [
        { name: "lib", isDir: true, size: 0 },
        { name: "boot.py", isDir: false, size: 7 },
        { name: "main.py", isDir: false, size: 9 },
      ],
      free: 1835008,
      total: 2097152,
    });
    expect((await session.repl.listDir("/lib")).entries).toEqual([{ name: "ssd1306.py", isDir: false, size: 12 }]);
  });

  it("reports a folder that is not there", async () => {
    await expect(session.repl.listDir("/nope")).rejects.toThrow("ENOENT");
  });

  it("reads back any bytes, across several pieces, exactly as written", async () => {
    const data = Uint8Array.from({ length: 5000 }, (_, i) => (i * 7) % 256);
    await session.repl.writeFile("/lib/blob.bin", data);
    expect(session.board.bytes["/lib/blob.bin"]).toEqual(data);
    expect(await session.repl.readFile("/lib/blob.bin", data.length)).toEqual(data);
    expect(new TextDecoder().decode(await session.repl.readFile("/lib/ssd1306.py", 12))).toBe("# 顯示器\n");
    expect((await session.repl.readFile("/main.py", 9)).length).toBe(9);
  });

  it("refuses a file that changed on the way", async () => {
    const originalRun = session.board.run.bind(session.board);
    session.board.run = (code: string) => {
      if (code.includes("b2a_base64")) session.board.emit("YWJj\r\n#0000\r\n\x04\x04>");
      else originalRun(code);
    };
    await expect(session.repl.readFile("/main.py", 9)).rejects.toThrow("驗證失敗");
  });

  it("deletes files, and folders only once they are empty", async () => {
    await session.repl.remove("/main.py", false);
    expect(session.board.files["/main.py"]).toBeUndefined();
    expect(await session.repl.remove("/lib", true)).toBe(false);
    expect(session.board.dirs.has("/lib")).toBe(true);
    await session.repl.remove("/lib/ssd1306.py", false);
    expect(await session.repl.remove("/lib", true)).toBe(true);
    expect(session.board.dirs.has("/lib")).toBe(false);
  });

  it("removes the half-written file when the flash fills up, keeping the old one", async () => {
    session.board.freeBytes = 3000;
    await expect(session.repl.writeFile("/main.py", new Uint8Array(5000))).rejects.toThrow("ENOSPC");
    expect(session.board.files["/main.py"]).toBe("print(1)\n");
    expect(session.board.tempData).toBeNull();
    expect((await session.repl.listDir("/")).entries.map((entry) => entry.name)).not.toContain(".upload.tmp");
  });
});
