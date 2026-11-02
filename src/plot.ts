// Turns the board's printed lines into numbers for the chart and the CSV file. Nothing here touches the page.

/** More lines than this would need colours that are hard to tell apart. */
export const MAX_SERIES = 8;
/** About 30 minutes of a program printing once every 20 ms. */
export const MAX_ROWS = 100_000;
// Dropping the oldest rows one at a time would copy every column for each new line.
const TRIM_SLACK = MAX_ROWS / 10;
// A program that prints without ever ending a line must not grow this buffer forever.
const MAX_PARTIAL_LINE = 2000;

export interface Sample {
  name: string;
  value: number;
}

const NUMBER = String.raw`[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?`;
// A name is one word with no spaces. A number running into another digit, as in a version like 1.29.0, is not a value.
const PAIR = new RegExp(String.raw`([^\s:：=,;]+)\s*[:：=]\s*(${NUMBER})(?!\.?\d)`, "g");
const ONLY_NUMBERS = new RegExp(String.raw`^${NUMBER}(?:\s*[,;\s]\s*${NUMBER})*$`);
// The chip prints its own report after a reset, such as "load:0x3fff0030,len:4728" and "mode:DIO, clock div:2".
const BOOT_REPORT = /0x[0-9a-f]|^(?:ets |rst:|configsip:|clk_drv:|mode:|load:|ho \d|entry )/i;
// Errors such as "OSError: -202" carry a number that is a code, not a measurement.
const ERROR_LINE = /^\w*(?:Error|Exception|Interrupt)\b/;
// The prompt, a continued line, and the board echoing a pasted block ("=== x = 5").
const ECHO = /^(?:>>>|\.\.\.|===)/;
const ONLY_DIGITS = /^[-+\d.]+$/;

/**
 * Reads the values in one printed line. Two forms are understood:
 * "name: value" pairs, where the name is one word and any unit after the value is ignored,
 * and lines holding nothing but numbers, which are named by their position.
 * Returns null for anything else, such as prompts, errors and plain messages.
 */
export function parseDataLine(line: string, unnamed: (position: number) => string): Sample[] | null {
  const text = line.trim();
  if (!text || ECHO.test(text) || BOOT_REPORT.test(text) || ERROR_LINE.test(text)) return null;

  const named = new Map<string, number>();
  for (const [, name, value] of text.matchAll(PAIR)) {
    // In a time such as 12:30, the part before the colon is not a name.
    if (!ONLY_DIGITS.test(name)) named.set(name, Number(value));
  }
  if (named.size > 0) return [...named].map(([name, value]) => ({ name, value }));

  if (!ONLY_NUMBERS.test(text)) return null;
  return text.split(/[\s,;]+/).map((value, index) => ({ name: unnamed(index + 1), value: Number(value) }));
}

/** Splits streamed text into complete lines, keeping a line that has not ended yet for the next piece. */
export class LineBuffer {
  private partial = "";

  push(text: string): string[] {
    const lines = (this.partial + text).split("\n");
    this.partial = lines.pop() ?? "";
    if (this.partial.length > MAX_PARTIAL_LINE) this.partial = "";
    return lines.map((line) => line.replace(/\r$/, ""));
  }

  reset(): void {
    this.partial = "";
  }
}

export interface Series {
  name: string;
  /** One entry per row; undefined where that row did not print this name. */
  values: (number | undefined)[];
}

/** Every value received, with its time in milliseconds since the first one. */
export class DataLog {
  times: number[] = [];
  series: Series[] = [];
  /** Rows dropped from the front to stay within MAX_ROWS. */
  dropped = 0;
  private start: number | null = null;

  get rowCount(): number {
    return this.times.length;
  }

  /** Returns false when nothing was added, because every name was new and there was no room for more lines. */
  add(now: number, samples: Sample[]): boolean {
    const row = this.times.length;
    let added = false;
    for (const { name, value } of samples) {
      if (!Number.isFinite(value)) continue;
      let series = this.series.find((item) => item.name === name);
      if (!series) {
        if (this.series.length >= MAX_SERIES) continue;
        series = { name, values: [] };
        this.series.push(series);
      }
      // Filling the gap keeps the array packed, which stays fast in the browser.
      while (series.values.length < row) series.values.push(undefined);
      series.values[row] = value;
      added = true;
    }
    if (!added) return false;
    this.start ??= now;
    this.times.push(now - this.start);
    if (this.times.length > MAX_ROWS + TRIM_SLACK) this.trim(this.times.length - MAX_ROWS);
    return true;
  }

  private trim(count: number): void {
    this.times.splice(0, count);
    for (const series of this.series) series.values.splice(0, count);
    this.dropped += count;
  }

  clear(): void {
    this.times = [];
    this.series = [];
    this.dropped = 0;
    this.start = null;
  }

  /** The newest value of a line, or undefined when it has none left. */
  latest(series: Series): number | undefined {
    for (let index = series.values.length - 1; index >= 0; index--) {
      if (series.values[index] !== undefined) return series.values[index];
    }
    return undefined;
  }

  /**
   * Writes the rows as CSV. The byte order mark lets Excel read Chinese names correctly,
   * and a name starting like a formula is quoted so Excel shows it as text.
   */
  toCsv(timeHeader: string): string {
    const header = [timeHeader, ...this.series.map((series) => series.name)].map(csvCell).join(",");
    const rows = this.times.map((time, index) =>
      [(time / 1000).toFixed(3), ...this.series.map((series) => series.values[index] ?? "")].join(","),
    );
    return `﻿${[header, ...rows].join("\r\n")}\r\n`;
  }
}

function csvCell(text: string): string {
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** The index of the first time at or after `time`, found by halving because the times only grow. */
export function firstIndexFrom(times: number[], time: number): number {
  let low = 0;
  let high = times.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (times[middle] < time) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** A round gap between grid lines (1, 2 or 5 times a power of ten) giving about `count` lines across `range`. */
export function niceStep(range: number, count: number): number {
  if (!(range > 0) || count < 1) return 1;
  const rough = range / count;
  const power = 10 ** Math.floor(Math.log10(rough));
  const scaled = rough / power;
  return (scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10) * power;
}

/** Shows a value briefly, without the long tails of floating-point numbers such as 0.30000000000000004. */
export function formatValue(value: number): string {
  return String(Number(value.toPrecision(6)));
}

/** A file name holding the local date and time, such as esp32-data-20261103-142530.csv. */
export function csvFileName(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `esp32-data-${day}-${time}.csv`;
}
