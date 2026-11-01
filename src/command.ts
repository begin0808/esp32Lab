const HISTORY_LIMIT = 50;
const INDENT = 4;

/** Commands stay in memory only, because one may hold a Wi-Fi password and the computer may be shared. */
export class CommandHistory {
  private readonly entries: string[] = [];
  private position = 0;
  private draft = "";

  add(command: string): void {
    if (command && this.entries.at(-1) !== command) this.entries.push(command);
    if (this.entries.length > HISTORY_LIMIT) this.entries.shift();
    this.position = this.entries.length;
    this.draft = "";
  }

  /** Returns the older command, or null when there is none. Unsent text comes back at the newest end. */
  previous(current: string): string | null {
    if (this.position === 0) return null;
    if (this.position === this.entries.length) this.draft = current;
    this.position--;
    return this.entries[this.position];
  }

  next(): string | null {
    if (this.position >= this.entries.length) return null;
    this.position++;
    return this.position === this.entries.length ? this.draft : this.entries[this.position];
  }
}

function lastLine(text: string): string {
  return text.slice(text.lastIndexOf("\n") + 1);
}

/** Whether Enter runs the text or continues it: a block runs after a blank line, as in Python's own prompt. */
export function enterAction(text: string): "send" | "newline" {
  const line = lastLine(text);
  if (line.trimEnd().endsWith(":")) return "newline";
  if (!text.includes("\n")) return "send";
  return line.trim() === "" ? "send" : "newline";
}

/** The indent for the next line of a block. The board's own auto-indent is avoided by sending blocks whole. */
export function nextIndent(text: string): string {
  const line = lastLine(text);
  const indent = line.length - line.trimStart().length;
  return " ".repeat(indent + (line.trimEnd().endsWith(":") ? INDENT : 0));
}

export interface Completion {
  line: string;
  choices: string[];
}

/**
 * Reads the board's answer to a line followed by Tab. It echoes the line and adds any completed text,
 * or lists the choices and prints the prompt and the line again.
 */
export function parseCompletion(sent: string, reply: string): Completion {
  const lines = reply.split(/\r*\n/);
  const last = lines.at(-1)!;
  if (lines.length > 1 && last.startsWith(">>> ")) {
    const choices = lines.slice(1, -1).flatMap((text) => text.trim().split(/\s+/)).filter(Boolean);
    return { line: last.slice(4), choices };
  }
  return { line: reply.startsWith(sent) ? reply : sent, choices: [] };
}
