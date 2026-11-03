import { t } from "./i18n";

const CP210X_VENDOR_ID = 0x10c4;
const CH340_VENDOR_ID = 0x1a86;
const ESPRESSIF_VENDOR_ID = 0x303a;
// The chip's built-in USB-to-serial block, as opposed to MicroPython's own USB stack.
const USB_JTAG_SERIAL_PRODUCT_ID = 0x1001;

export const BAUD_RATE = 115200;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Owns the Web Serial port while no firmware flashing is in progress. */
export class SerialLink {
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private readLoopDone: Promise<void> | null = null;
  private sink: (data: Uint8Array) => void = () => {};
  /** The last write, so a write made while another is under way waits its turn instead of failing. */
  private writing: Promise<void> = Promise.resolve();

  /** Called when the port goes away without close() being called. */
  onLost: () => void = () => {};

  static isSupported(): boolean {
    return "serial" in navigator;
  }

  get isOpen(): boolean {
    return this.reader !== null;
  }

  get selectedPort(): SerialPort | null {
    return this.port;
  }

  /** True when the board plugs straight into the chip's USB, with no separate USB-to-serial chip. */
  get isNativeUsb(): boolean {
    return this.port?.getInfo().usbVendorId === ESPRESSIF_VENDOR_ID;
  }

  setSink(sink: (data: Uint8Array) => void): void {
    this.sink = sink;
  }

  async requestPort(): Promise<void> {
    this.port = await navigator.serial.requestPort({
      filters: [{ usbVendorId: CP210X_VENDOR_ID }, { usbVendorId: CH340_VENDOR_ID }, { usbVendorId: ESPRESSIF_VENDOR_ID }],
    });
  }

  async open(): Promise<void> {
    if (!this.port) throw new Error(t("尚未選擇序列埠"));
    await this.port.open({ baudRate: BAUD_RATE });
    // Keep EN and IO0 released so that opening the port does not hold the board in reset.
    await this.port.setSignals({ dataTerminalReady: false, requestToSend: false });
    // MicroPython's own USB stack discards output until the computer raises DTR.
    const info = this.port.getInfo();
    if (this.isNativeUsb && info.usbProductId !== USB_JTAG_SERIAL_PRODUCT_ID) {
      await this.port.setSignals({ dataTerminalReady: true, requestToSend: false });
    }
    this.reader = this.port.readable!.getReader();
    this.readLoopDone = this.readLoop(this.reader);
  }

  async close(): Promise<void> {
    const reader = this.reader;
    this.reader = null;
    if (reader) {
      await reader.cancel().catch(() => {});
      await this.readLoopDone;
    }
    this.readLoopDone = null;
    await this.port?.close().catch(() => {});
  }

  /**
   * Writes in order. The board can answer while a write is still under way, and the answer may need a write of
   * its own, such as leaving raw REPL once a program ends; only one writer may hold the port at a time.
   */
  write(data: Uint8Array): Promise<void> {
    const next = this.writing.then(() => this.writeNow(data));
    this.writing = next.catch(() => {});
    return next;
  }

  private async writeNow(data: Uint8Array): Promise<void> {
    const writable = this.port?.writable;
    if (!writable) throw new Error(t("開發板尚未連接"));
    const writer = writable.getWriter();
    try {
      await writer.write(data);
    } finally {
      writer.releaseLock();
    }
  }

  /**
   * Pulses EN through the board's auto-reset circuit while keeping IO0 high.
   * Built-in USB has no such circuit, and resetting would drop the port, so it does nothing there.
   */
  async hardReset(): Promise<void> {
    if (!this.port || this.isNativeUsb) return;
    await this.port.setSignals({ dataTerminalReady: false, requestToSend: true });
    await sleep(100);
    await this.port.setSignals({ dataTerminalReady: false, requestToSend: false });
  }

  private async readLoop(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) this.sink(value);
      }
    } catch {
      // Handled below: an unexpected end of the stream means the board was unplugged.
    } finally {
      reader.releaseLock();
    }
    if (this.reader === reader) {
      this.reader = null;
      this.onLost();
    }
  }
}
