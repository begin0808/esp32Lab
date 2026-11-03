// A simulated MicroPython board speaking raw REPL, as a Web Serial port. Shared by unit and e2e tests.
// It parses only the commands this site sends; it is not a Python interpreter.
(function (root) {
  const OK = "OK";
  const END = "\x04\x04>";

  class FakeBoard {
    constructor({
      hasMicroPython = true,
      runOutput = "IP: 192.168.1.105\r\n",
      machine = "Generic ESP32 module with ESP32",
      usb = { usbVendorId: 0x10c4, usbProductId: 0xea60 },
      // "on" like current firmware, "off" when the firmware turned it off, "unknown" for firmware older than v1.14.
      rawPaste = "on",
      // Small, so tests cover several rounds of "send more".
      pasteWindow = 64,
    } = {}) {
      this.hasMicroPython = hasMicroPython;
      this.runOutput = runOutput;
      this.machine = machine;
      this.usb = usb;
      this.softResets = 0;
      this.files = {};
      this.mode = "friendly";
      this.command = [];
      this.line = "";
      this.commands = [];
      this.pasted = [];
      this.tempData = null;
      this.resets = 0;
      this.received = [];
      this.rawPaste = rawPaste;
      this.pasteWindow = pasteWindow;
      this.probe = null;
      this.allowance = 0;
      this.consumed = 0;
      /** Set when the site sent more raw-paste data than the board allowed. */
      this.overflow = false;
      /** Commands run in raw REPL, each one a round trip. */
      this.execs = 0;
      this.onOutput = () => {};
      this.onUnplug = () => {};
    }

    unplug() {
      this.onUnplug();
    }

    emit(text) {
      this.onOutput(new TextEncoder().encode(text));
    }

    receive(bytes) {
      this.received.push(...bytes);
      if (!this.hasMicroPython) return;
      for (const byte of bytes) this.receiveByte(byte);
    }

    receiveByte(byte) {
      if (this.mode === "rawpaste") {
        if (byte === 0x04) {
          const code = new TextDecoder().decode(new Uint8Array(this.command));
          this.command = [];
          this.mode = "raw";
          this.execs++;
          this.emit("\x04");
          this.run(code);
          return;
        }
        this.command.push(byte);
        if (--this.allowance < 0) this.overflow = true;
        if (++this.consumed === this.pasteWindow) {
          this.consumed = 0;
          // A real board asks for more only after it has taken the bytes in, so the grant arrives after this write.
          Promise.resolve().then(() => {
            this.allowance += this.pasteWindow;
            this.emit("\x01");
          });
        }
        return;
      }
      if (this.mode === "raw") {
        if (this.probe) {
          this.probe.push(byte);
          if (this.probe.length < 3) return;
          const probe = this.probe;
          this.probe = null;
          if (probe[1] !== 0x41 || probe[2] !== 0x01) {
            this.command.push(...probe);
          } else if (this.rawPaste === "on") {
            this.mode = "rawpaste";
            this.allowance = this.pasteWindow;
            this.consumed = 0;
            this.emit("R\x01" + String.fromCharCode(this.pasteWindow & 0xff, this.pasteWindow >> 8));
          } else if (this.rawPaste === "off") {
            this.emit("R\x00");
          } else {
            // Old firmware: the final Ctrl-A starts raw REPL again.
            this.command = [];
            this.emit("raw REPL; CTRL-B to exit\r\n>");
          }
          return;
        }
        if (byte === 0x05 && this.command.length === 0) {
          this.probe = [byte];
        } else if (byte === 0x04) {
          const code = new TextDecoder().decode(new Uint8Array(this.command));
          this.command = [];
          this.execs++;
          this.emit(OK);
          this.run(code);
        } else if (byte === 0x01) {
          this.command = [];
          this.emit("raw REPL; CTRL-B to exit\r\n>");
        } else if (byte === 0x02) {
          this.mode = "friendly";
          this.emit("\r\n>>> ");
        } else if (byte === 0x03) {
          this.command = [];
        } else {
          this.command.push(byte);
        }
        return;
      }
      if (this.mode === "paste") {
        if (byte === 0x04) {
          this.pasted.push(new TextDecoder().decode(new Uint8Array(this.command)));
          this.command = [];
          this.mode = "friendly";
          this.emit("\r\nran block\r\n>>> ");
        } else {
          this.command.push(byte);
          this.emit(byte === 0x0d ? "\r\n=== " : String.fromCharCode(byte));
        }
        return;
      }
      if (byte === 0x05) {
        this.mode = "paste";
        this.command = [];
        this.emit("\r\npaste mode; Ctrl-C to cancel, Ctrl-D to finish\r\n=== ");
      } else if (byte === 0x09) {
        this.complete();
      } else if (byte === 0x0d) {
        const command = this.line;
        this.line = "";
        if (command) this.commands.push(command);
        this.emit(`\r\n${command === "1+1" ? "2\r\n" : ""}>>> `);
      } else if (byte >= 0x20 && byte < 0x7f) {
        this.line += String.fromCharCode(byte);
        this.emit(String.fromCharCode(byte));
      } else if (byte === 0x01) {
        this.mode = "raw";
        this.line = "";
        this.emit("raw REPL; CTRL-B to exit\r\n>");
      } else if (byte === 0x03) {
        this.line = "";
        this.emit("\r\n>>> ");
      } else if (byte === 0x04) {
        this.softResets++;
        this.emit("MPY: soft reboot\r\n");
        if (this.files["/main.py"]) setTimeout(() => this.emit(this.runOutput), 20);
      }
    }

    /** Answers Tab in the same format as a real REPL. */
    complete() {
      if (this.line === "impor") {
        this.line = "import ";
        this.emit("t ");
      } else if (this.line === "sys.std") {
        this.emit(`\r\nstderr          stdin           stdout\r\n>>> ${this.line}`);
      }
    }

    run(code) {
      if (code.includes("os.uname()")) {
        this.emit(`v1.29.0|${this.machine}|4194304\r\n` + END);
      } else if (code.includes("'wb'")) {
        this.tempData = [];
        this.emit(END);
      } else if (code.startsWith("w(a(b'")) {
        const binary = atob(code.slice(6, -3));
        for (let i = 0; i < binary.length; i++) this.tempData.push(binary.charCodeAt(i));
        this.emit(END);
      } else if (code.includes("sha256")) {
        const data = new Uint8Array(this.tempData);
        crypto.subtle.digest("SHA-256", data).then((digest) => {
          const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
          this.emit(`${data.length}|${hex}\r\n` + END);
        });
      } else if (code.includes("os.rename")) {
        const path = code.match(/os\.remove\("([^"]+)"\)/)[1];
        this.files[path] = new TextDecoder().decode(new Uint8Array(this.tempData));
        this.emit(END);
      } else if (code.includes("__fail__")) {
        this.emit("\x04Traceback (most recent call last):\r\nOSError: 28\r\n\x04>");
      } else {
        this.emit(END);
      }
    }

    reset() {
      this.resets++;
      this.mode = "friendly";
      this.command = [];
      this.line = "";
      this.emit("rst:0x1 (POWERON_RESET),boot:0x13 (SPI_FAST_FLASH_BOOT)\r\n");
      if (this.files["/main.py"]) setTimeout(() => this.emit(this.runOutput), 20);
    }
  }

  class FakePort {
    constructor(board) {
      this.board = board;
      this.readable = null;
      this.writable = null;
      this.rts = false;
    }

    async open() {
      this.readable = new ReadableStream({
        start: (controller) => {
          this.board.onOutput = (data) => controller.enqueue(data);
          this.board.onUnplug = () => controller.error(new DOMException("Device lost", "NetworkError"));
        },
        cancel: () => {
          this.board.onOutput = () => {};
        },
      });
      this.writable = new WritableStream({
        write: (chunk) => this.board.receive(chunk),
      });
    }

    async close() {
      this.readable = null;
      this.writable = null;
    }

    async setSignals({ dataTerminalReady, requestToSend }) {
      this.board.dtr = dataTerminalReady;
      if (this.rts && requestToSend === false) this.board.reset();
      this.rts = requestToSend;
    }

    getInfo() {
      return this.board.usb;
    }
  }

  root.FakeBoard = FakeBoard;
  root.FakePort = FakePort;
})(globalThis);
