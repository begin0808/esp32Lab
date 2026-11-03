const END = "\x04";

/**
 * Follows the output of a program started from raw REPL. The board marks the end of its output with Ctrl-D,
 * then the error text, another Ctrl-D and the raw prompt ">". The markers are dropped so the monitor shows
 * the same text as for a program run from main.py, and `finished` turns true once, when the prompt arrives.
 */
export class RawRunWatcher {
  private ends = 0;
  private done = false;

  push(text: string): { text: string; finished: boolean } {
    if (this.done) return { text, finished: false };
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
        return { text: shown + text.slice(i + 1), finished: true };
      }
      shown += char;
    }
    return { text: shown, finished: false };
  }
}
