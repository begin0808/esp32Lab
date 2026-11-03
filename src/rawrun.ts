const END = "\x04";
// After any reset the chip's boot ROM prints a line such as "rst:0x5 (DEEPSLEEP_RESET)", below a line of its own.
const BOOT_REPORT = /\nrst:0x[0-9a-f]/;

/**
 * Follows the output of a program started from raw REPL. The board marks the end of its output with Ctrl-D,
 * then the error text, another Ctrl-D and the raw prompt ">". The markers are dropped so the monitor shows
 * the same text as for a program run from main.py, and `finished` turns true once, when the prompt arrives.
 * If the board restarts instead (deep sleep, machine.reset() or a crash), `restarted` turns true once:
 * the end markers will never come, and the board is now running its own main.py.
 */
export class RawRunWatcher {
  private ends = 0;
  private done = false;
  private tail = "";

  push(text: string): { text: string; finished: boolean; restarted: boolean } {
    if (this.done) return { text, finished: false, restarted: false };
    // The report may arrive split across two pieces of output.
    const recent = this.tail + text;
    if (BOOT_REPORT.test(recent)) {
      this.done = true;
      return { text, finished: false, restarted: true };
    }
    this.tail = recent.slice(-16);
    let shown = "";
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === END && this.ends < 2) {
        this.ends++;
        continue;
      }
      if (this.ends === 2 && char === ">") {
        this.done = true;
        // Anything after the prompt, such as the banner once raw REPL is left, is ordinary output.
        return { text: shown + text.slice(i + 1), finished: true, restarted: false };
      }
      shown += char;
    }
    return { text: shown, finished: false, restarted: false };
  }
}
