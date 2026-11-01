import { t } from "./i18n";

const CTRL_A = 0x01;
const CTRL_B = 0x02;
const CTRL_C = 0x03;
const CTRL_D = 0x04;

const RAW_BANNER = "raw REPL; CTRL-B to exit\r\n>";
const WRITE_CHUNK = 256;
const FILE_CHUNK = 256;
const TMP_PATH = "/.upload.tmp";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface ByteIO {
  write(data: Uint8Array): Promise<void>;
  setSink(sink: (data: Uint8Array) => void): void;
}

export class ReplTimeoutError extends Error {}

/** The Python code on the board raised an exception. */
export class ReplExecError extends Error {}

export interface BoardInfo {
  release: string;
  machine: string;
  flashBytes: number | null;
}

/** Encodes bytes as a Python bytes literal, so UTF-8 text survives the raw REPL unchanged. */
export function pythonBytesLiteral(data: Uint8Array): string {
  let out = "b'";
  for (const byte of data) {
    if (byte >= 0x20 && byte < 0x7f && byte !== 0x27 && byte !== 0x5c) {
      out += String.fromCharCode(byte);
    } else {
      out += "\\x" + byte.toString(16).padStart(2, "0");
    }
  }
  return out + "'";
}

export function byteChecksum(data: Uint8Array): number {
  let sum = 0;
  for (const byte of data) sum = (sum + byte) & 0xffff;
  return sum;
}

function pythonString(text: string): string {
  return JSON.stringify(text);
}

/** MicroPython raw REPL client, following the same protocol as mpremote. */
export class RawRepl {
  private buffer = new Uint8Array(0);
  private waiter: (() => void) | null = null;
  private readonly decoder = new TextDecoder();
  private readonly encoder = new TextEncoder();

  constructor(private readonly io: ByteIO) {}

  /** Starts receiving board output. The caller restores the previous sink afterwards. */
  attach(): void {
    this.io.setSink((data) => {
      const merged = new Uint8Array(this.buffer.length + data.length);
      merged.set(this.buffer);
      merged.set(data, this.buffer.length);
      this.buffer = merged;
      this.waiter?.();
    });
  }

  /** Stops any running program and enters raw REPL. Throws ReplTimeoutError if nothing answers. */
  async enter(timeoutMs = 2500, attempts = 3): Promise<void> {
    for (let attempt = 0; attempt < attempts; attempt++) {
      await this.io.write(Uint8Array.of(0x0d, CTRL_C, CTRL_C));
      await sleep(150);
      this.buffer = new Uint8Array(0);
      await this.io.write(Uint8Array.of(CTRL_A));
      try {
        await this.readUntil(RAW_BANNER, timeoutMs);
        return;
      } catch (error) {
        if (!(error instanceof ReplTimeoutError)) throw error;
      }
    }
    throw new ReplTimeoutError(t("沒有偵測到 MicroPython"));
  }

  async exit(): Promise<void> {
    await this.io.write(Uint8Array.of(CTRL_B));
    await sleep(50);
  }

  /** Runs code and returns its stdout. Must be in raw REPL. */
  async exec(code: string, timeoutMs = 5000): Promise<string> {
    const bytes = this.encoder.encode(code);
    for (let offset = 0; offset < bytes.length; offset += WRITE_CHUNK) {
      await this.io.write(bytes.subarray(offset, offset + WRITE_CHUNK));
      await sleep(10);
    }
    await this.io.write(Uint8Array.of(CTRL_D));

    const ack = await this.readUntil("OK", timeoutMs);
    if (ack !== "OK") throw new ReplExecError(ack);
    const stdout = await this.readUntil("\x04", timeoutMs);
    const stderr = await this.readUntil("\x04", timeoutMs);
    await this.readUntil(">", timeoutMs);
    if (stderr.length > 1) throw new ReplExecError(stderr.slice(0, -1));
    return stdout.slice(0, -1);
  }

  async readBoardInfo(): Promise<BoardInfo> {
    const output = await this.exec(
      [
        "import os",
        "try:",
        " import esp",
        " s=esp.flash_size()",
        "except Exception:",
        " s=-1",
        "u=os.uname()",
        "print(u.release+'|'+u.machine+'|'+str(s))",
      ].join("\n"),
    );
    const [release, machine, size] = output.trim().split("|");
    const flashBytes = Number(size);
    return { release, machine, flashBytes: flashBytes > 0 ? flashBytes : null };
  }

  /** Writes to a temporary file first, so a failed upload leaves the old program intact. */
  async writeFile(path: string, data: Uint8Array, onProgress?: (fraction: number) => void): Promise<void> {
    await this.exec(`f=open(${pythonString(TMP_PATH)},'wb')\nw=f.write`);
    for (let offset = 0; offset < data.length; offset += FILE_CHUNK) {
      const chunk = data.subarray(offset, offset + FILE_CHUNK);
      await this.exec(`w(${pythonBytesLiteral(chunk)})`);
      onProgress?.(Math.min(1, (offset + chunk.length) / data.length));
    }
    await this.exec("f.close()");

    const stored = await this.exec(
      [
        `f=open(${pythonString(TMP_PATH)},'rb')`,
        "n=0",
        "s=0",
        "b=bytearray(256)",
        "while 1:",
        " k=f.readinto(b)",
        " if not k:",
        "  break",
        " n+=k",
        " for i in range(k):",
        "  s=(s+b[i])&0xffff",
        "f.close()",
        "print(str(n)+'|'+str(s))",
      ].join("\n"),
      15000,
    );
    if (stored.trim() !== `${data.length}|${byteChecksum(data)}`) {
      throw new Error(t("檔案驗證失敗，請重新上傳"));
    }

    await this.exec(
      [
        "import os",
        "try:",
        ` os.remove(${pythonString(path)})`,
        "except OSError:",
        " pass",
        `os.rename(${pythonString(TMP_PATH)},${pythonString(path)})`,
      ].join("\n"),
    );
  }

  private async readUntil(marker: string, timeoutMs: number): Promise<string> {
    const target = this.encoder.encode(marker);
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const index = indexOfBytes(this.buffer, target);
      if (index >= 0) {
        const end = index + target.length;
        const text = this.decoder.decode(this.buffer.subarray(0, end));
        this.buffer = this.buffer.slice(end);
        return text;
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new ReplTimeoutError(t("等待開發板回應逾時"));
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, remaining);
        this.waiter = () => {
          clearTimeout(timer);
          resolve();
        };
      });
      this.waiter = null;
    }
  }
}

function indexOfBytes(haystack: Uint8Array, needle: Uint8Array): number {
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}
