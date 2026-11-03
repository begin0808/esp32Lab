import { t } from "./i18n";

const CTRL_A = 0x01;
const CTRL_B = 0x02;
const CTRL_C = 0x03;
const CTRL_D = 0x04;
const CTRL_E = 0x05;

const RAW_BANNER = "raw REPL; CTRL-B to exit\r\n>";
// Firmware without raw-paste mode reads the Ctrl-A as "start raw REPL again" and prints the banner.
const RAW_BANNER_TAIL = "w REPL; CTRL-B to exit\r\n>";
const RAW_PASTE_REQUEST = Uint8Array.of(CTRL_E, 0x41, CTRL_A);
// Without raw-paste flow control, small pieces with gaps keep the board's receive buffer from overflowing.
const WRITE_CHUNK = 256;
const WRITE_GAP_MS = 10;
// Each piece of a file is one command, so bigger pieces mean fewer round trips. As base64 it is about 2.7 KB of code,
// which the board compiles comfortably even without PSRAM.
const FILE_CHUNK = 2048;
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

/**
 * Encodes bytes as base64 for the board to decode. A Python escape such as \xe6 takes 4 characters
 * for each byte of Chinese text, but base64 always takes 4 characters per 3 bytes.
 */
export function toBase64(data: Uint8Array): string {
  let binary = "";
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data as BufferSource));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** A whole block for paste mode, which compiles it at once and skips the board's auto-indent. */
export function pasteModeBytes(code: string): Uint8Array {
  const text = new TextEncoder().encode(`${code.trimEnd().replace(/\r?\n/g, "\r")}\r`);
  const bytes = new Uint8Array(text.length + 2);
  bytes[0] = CTRL_E;
  bytes.set(text, 1);
  bytes[bytes.length - 1] = CTRL_D;
  return bytes;
}

function pythonString(text: string): string {
  return JSON.stringify(text);
}

/** MicroPython raw REPL client, following the same protocol as mpremote. */
export class RawRepl {
  private buffer = new Uint8Array(0);
  private waiter: (() => void) | null = null;
  /** Unknown until the first command; firmware that lacks raw-paste mode is not asked again. */
  private rawPaste: boolean | null = null;
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

  /** True after a command was sent in raw-paste mode, which the board paces itself. */
  get usedRawPaste(): boolean {
    return this.rawPaste === true;
  }

  /** Runs code and returns its stdout. Must be in raw REPL. */
  async exec(code: string, timeoutMs = 5000): Promise<string> {
    const bytes = this.encoder.encode(code);
    if (!(await this.tryRawPaste(bytes, timeoutMs))) {
      for (let offset = 0; offset < bytes.length; offset += WRITE_CHUNK) {
        await this.io.write(bytes.subarray(offset, offset + WRITE_CHUNK));
        await sleep(WRITE_GAP_MS);
      }
      await this.io.write(Uint8Array.of(CTRL_D));
      const ack = await this.readUntil("OK", timeoutMs);
      if (ack !== "OK") throw new ReplExecError(ack);
    }
    const stdout = await this.readUntil("\x04", timeoutMs);
    const stderr = await this.readUntil("\x04", timeoutMs);
    await this.readUntil(">", timeoutMs);
    if (stderr.length > 1) throw new ReplExecError(stderr.slice(0, -1));
    return stdout.slice(0, -1);
  }

  /**
   * Sends a command in raw-paste mode, the same way as mpremote. The board says how many bytes it can take
   * and asks for more when it is ready, so nothing is lost and no fixed pauses are needed.
   * Returns false, having sent nothing, when the firmware does not support this mode.
   */
  private async tryRawPaste(bytes: Uint8Array, timeoutMs: number): Promise<boolean> {
    if (this.rawPaste === false) return false;
    await this.io.write(RAW_PASTE_REQUEST);
    const reply = this.decoder.decode(await this.readBytes(2, timeoutMs));
    if (reply !== "R\x01") {
      // "R\x00" means it understood but has the mode turned off; anything else is the start of the banner.
      if (reply !== "R\x00") await this.readUntil(RAW_BANNER_TAIL, timeoutMs);
      this.rawPaste = false;
      return false;
    }
    this.rawPaste = true;

    const header = await this.readBytes(2, timeoutMs);
    const windowSize = header[0] | (header[1] << 8);
    let allowed = windowSize;
    let offset = 0;
    while (offset < bytes.length) {
      while (allowed === 0 || this.buffer.length > 0) {
        const [signal] = await this.readBytes(1, timeoutMs);
        if (signal === CTRL_A) {
          allowed += windowSize;
        } else if (signal === CTRL_D) {
          // The board stopped reading early, for example after Ctrl-C. Its output explains why.
          await this.io.write(Uint8Array.of(CTRL_D));
          return true;
        } else {
          throw new ReplExecError(t("開發板傳回非預期的資料"));
        }
      }
      const piece = bytes.subarray(offset, offset + allowed);
      await this.io.write(piece);
      allowed -= piece.length;
      offset += piece.length;
    }
    await this.io.write(Uint8Array.of(CTRL_D));
    await this.readUntil("\x04", timeoutMs);
    return true;
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
    await this.exec(`import binascii\nf=open(${pythonString(TMP_PATH)},'wb')\nw=f.write\na=binascii.a2b_base64`);
    for (let offset = 0; offset < data.length; offset += FILE_CHUNK) {
      const chunk = data.subarray(offset, offset + FILE_CHUNK);
      await this.exec(`w(a(b'${toBase64(chunk)}'))`);
      onProgress?.(Math.min(1, (offset + chunk.length) / data.length));
    }
    await this.exec("f.close()");

    // The board's own SHA-256 is far faster than adding up bytes in Python, and catches any change.
    const [stored, expected] = await Promise.all([
      this.exec(
        [
          "import hashlib",
          `f=open(${pythonString(TMP_PATH)},'rb')`,
          "h=hashlib.sha256()",
          "n=0",
          "b=bytearray(512)",
          "m=memoryview(b)",
          "while 1:",
          " k=f.readinto(b)",
          " if not k:",
          "  break",
          " n+=k",
          " h.update(m[:k])",
          "f.close()",
          "print(str(n)+'|'+binascii.hexlify(h.digest()).decode())",
        ].join("\n"),
        15000,
      ),
      sha256Hex(data),
    ]);
    if (stored.trim() !== `${data.length}|${expected}`) {
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

  private async readBytes(count: number, timeoutMs: number): Promise<Uint8Array> {
    const deadline = Date.now() + timeoutMs;
    while (this.buffer.length < count) await this.waitForData(deadline);
    const bytes = this.buffer.slice(0, count);
    this.buffer = this.buffer.slice(count);
    return bytes;
  }

  private async waitForData(deadline: number): Promise<void> {
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
      await this.waitForData(deadline);
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
