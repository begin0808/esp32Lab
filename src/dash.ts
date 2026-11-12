import { lang, t } from "./i18n";
import { csvCell } from "./plot";
import chineseDash from "./lib/dash.py?raw";
import englishDash from "./lib/en/dash.py?raw";

/** Where the site saves the dashboard helper on the board. MicroPython looks in /lib for imports. */
export const DASH_PATH = "/lib/dash.py";

export const WIDGET_KINDS = [
  "value", "gauge", "chart", "led", "text", "alert", "log",
  "switch", "button", "slider", "color", "pad", "select", "input", "number", "tilt", "joystick",
] as const;
export type WidgetKind = (typeof WIDGET_KINDS)[number];

export const LED_COLORS = ["green", "red", "yellow", "blue"] as const;
export type LedColor = (typeof LED_COLORS)[number];

export interface Widget {
  id: string;
  kind: WidgetKind;
  label: string;
  unit: string;
  min: number;
  max: number;
  /** How much a number setting changes with each tap of its - and + buttons. */
  step: number;
  color: LedColor;
  /** The choices of a select widget, or the column names of a log. */
  options: string[];
}

const MAX_WIDGETS = 30;
const MAX_LABEL = 40;
const MAX_UNIT = 10;
const MAX_OPTIONS = 8;
const MAX_OPTION = 20;
export const MAX_COLUMNS = 6;
/** The most rows the board sends in one message, as it keeps no more while waiting. */
const MAX_WAITING = 20;
const MAX_CELL = 40;
/** Text the phone sends to the board, as the board keeps no more. */
export const MAX_INPUT = 100;
export const DIRECTIONS = ["up", "down", "left", "right"] as const;

export function dashTopic(channel: string, name: string): string {
  return `esp32-mp-class/${channel}/dash/${name}`;
}

/** Whether a program imports the dashboard helper, so the site has to put it on the board first. */
export function usesDash(code: string): boolean {
  return /^\s*(?:import\s+dash\b|from\s+dash\s+import\b)/m.test(code);
}

/** The helper for the page's language, with the dashboard page's address filled in. */
export function dashFile(page: string): string {
  // Git may check the file out with CRLF line ends; the same bytes everywhere keep the board's copy from being rewritten.
  return (lang === "en" ? englishDash : chineseDash).replace(/\r\n/g, "\n").replace("{{DASH_PAGE}}", page);
}

/** The address dash.py prints when it connects, which the editor turns into a link and a QR code. */
export function findDashboardUrl(text: string): string | null {
  return text.match(/https?:\/\/[^\s"'<>]+\/dashboard\.html\?ch=[A-Za-z0-9_-]{1,32}(?![A-Za-z0-9_-])/)?.[0] ?? null;
}

function text(value: unknown, limit: number): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Reads the layout the board publishes. Anyone who knows the topic can publish to it on a public broker,
 * so anything unexpected is dropped instead of trusted.
 */
export function parseLayout(json: string): Widget[] | null {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object" || !Array.isArray((data as { w?: unknown }).w)) return null;
  const widgets: Widget[] = [];
  const seen = new Set<string>();
  for (const item of (data as { w: unknown[] }).w) {
    if (widgets.length >= MAX_WIDGETS) break;
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    const kind = entry.t as WidgetKind;
    const id = entry.id;
    if (!WIDGET_KINDS.includes(kind) || typeof id !== "string" || !/^\d{1,2}[a-z]$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    const list = Array.isArray(entry.o) ? entry.o.map((option) => text(option, MAX_OPTION)) : [];
    // A log keeps every column in place, even a repeated name, so each value stays under its own heading.
    const options = kind === "log" ? list.slice(0, MAX_COLUMNS).map((name) => name || "-") : [...new Set(list.filter(Boolean))].slice(0, MAX_OPTIONS);
    // A select with nothing to choose, or a log with no columns, could not be used.
    if ((kind === "select" || kind === "log") && options.length === 0) continue;
    let min = finite(entry.min, 0);
    let max = finite(entry.max, 100);
    if (!(min < max)) [min, max] = [0, 100];
    const step = finite(entry.step, 1);
    widgets.push({
      id,
      kind,
      label: text(entry.l, MAX_LABEL) || id,
      unit: text(entry.u, MAX_UNIT),
      min,
      max,
      step: step > 0 ? step : 1,
      color: LED_COLORS.includes(entry.c as LedColor) ? (entry.c as LedColor) : "green",
      options,
    });
  }
  return widgets;
}

/** A value for a number widget, or null when the board sent something that is not a number. */
export function parseNumber(payload: string): number | null {
  if (!/^\s*-?\d+(?:\.\d+)?(?:e-?\d+)?\s*$/i.test(payload)) return null;
  const value = Number(payload);
  return Number.isFinite(value) ? value : null;
}

/** Where a value sits between min and max, from 0 to 1. */
export function gaugeFraction(value: number, min: number, max: number): number {
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

/** Numbers from a sensor can be long, so they are shown with at most two decimals. */
export function formatNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** A colour as the board sends it, such as #ff8000, or null for anything else. */
export function parseColor(payload: string): string | null {
  return /^#[0-9a-f]{6}$/i.test(payload) ? payload.toLowerCase() : null;
}

/** A time such as 10:08:02, the same on every phone whatever its language. */
export function formatClock(date: Date): string {
  return [date.getHours(), date.getMinutes(), date.getSeconds()].map((part) => String(part).padStart(2, "0")).join(":");
}

/** One cell of a log row as text: numbers with at most two decimals, an empty cell for a missing value. */
function cell(value: unknown): string {
  if (typeof value === "number") return Number.isFinite(value) ? formatNumber(value) : "";
  if (typeof value === "string") return value.slice(0, MAX_CELL);
  if (typeof value === "boolean") return String(value);
  return "";
}

/** The rows of a log message, each with exactly one cell per column, or null for anything that is not rows. */
export function parseRows(payload: string, columns: number): string[][] | null {
  let data: unknown;
  try {
    data = JSON.parse(payload);
  } catch {
    return null;
  }
  if (!Array.isArray(data)) return null;
  return data
    .slice(-MAX_WAITING)
    .filter((row): row is unknown[] => Array.isArray(row))
    .map((row) => Array.from({ length: columns }, (_, index) => cell(row[index])));
}

/** A date and time a spreadsheet understands, such as 2026-11-13 10:08:02. */
export function formatDateTime(date: Date): string {
  const day = [date.getFullYear(), date.getMonth() + 1, date.getDate()].map((part) => String(part).padStart(2, "0")).join("-");
  return `${day} ${formatClock(date)}`;
}

/** A log as CSV. Numbers stay numbers, so a spreadsheet can chart them; text is made safe like the plotter's CSV. */
export function logCsv(columns: string[], rows: { time: number; cells: string[] }[]): string {
  const header = [t("時間"), ...columns].map(csvCell).join(",");
  const lines = rows.map((row) => [formatDateTime(new Date(row.time)), ...row.cells.map((value) => (parseNumber(value) === null ? csvCell(value) : value))].join(","));
  return `\ufeff${[header, ...lines].join("\r\n")}\r\n`;
}

export interface BoardInfo {
  /** Wi-Fi signal in dBm, such as -55. */
  signal: number | null;
  /** Seconds since the board started. */
  uptime: number | null;
  /** Free memory in bytes. */
  memory: number | null;
}

/** What the board reports about itself. Like the layout, it comes from a public broker, so only numbers are kept. */
export function parseInfo(payload: string): BoardInfo | null {
  let data: unknown;
  try {
    data = JSON.parse(payload);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const entry = data as Record<string, unknown>;
  const number = (value: unknown, low: number, high: number) =>
    typeof value === "number" && Number.isFinite(value) && value >= low && value <= high ? Math.round(value) : null;
  return { signal: number(entry.r, -120, 0), uptime: number(entry.u, 0, 1e9), memory: number(entry.m, 0, 1e9) };
}

/** How long the board has run, in the two largest units, such as 1 小時 2 分. */
export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return t("{d} 天 {h} 小時", { d: days, h: hours });
  if (hours > 0) return t("{h} 小時 {m} 分", { h: hours, m: minutes });
  if (minutes > 0) return t("{m} 分 {s} 秒", { m: minutes, s: seconds % 60 });
  return t("{s} 秒", { s: seconds });
}

/** A Wi-Fi signal in words. Above -60 dBm is strong; below -70 dBm messages may start to drop. */
export function signalLevel(dbm: number): string {
  return dbm >= -60 ? t("強") : dbm >= -70 ? t("普通") : t("弱");
}

/** The board's report as one line, such as Wi-Fi 訊號 -55 dBm（強）・已執行 1 小時 2 分・剩餘記憶體 85 KB. */
export function formatInfo(info: BoardInfo): string {
  const parts: string[] = [];
  if (info.signal !== null && info.signal < 0) parts.push(t("Wi-Fi 訊號 {dbm} dBm（{level}）", { dbm: info.signal, level: signalLevel(info.signal) }));
  if (info.uptime !== null) parts.push(t("已執行 {time}", { time: formatUptime(info.uptime) }));
  if (info.memory !== null) parts.push(t("剩餘記憶體 {kb} KB", { kb: Math.round(info.memory / 1024) }));
  return parts.join(t("・"));
}

/** A joystick or tilt position as the board expects it, such as "30,-100", from -100 to 100 on each axis. */
export function formatVector(x: number, y: number): string {
  const fit = (value: number) => Math.max(-100, Math.min(100, Math.round(value))) || 0;
  return `${fit(x)},${fit(y)}`;
}

/** Tilt from the phone's angles: flat on a table is 0,0, and 45 degrees is full. Forward is the top edge dipping. */
export function tiltVector(beta: number, gamma: number): string {
  return formatVector((gamma / 45) * 100, (-beta / 45) * 100);
}

/** A joystick position from where the finger is, relative to the centre, kept inside the circle. */
export function stickVector(dx: number, dy: number, radius: number): string {
  const length = Math.hypot(dx, dy);
  const scale = length > radius ? radius / length : 1;
  return formatVector(((dx * scale) / radius) * 100, ((-dy * scale) / radius) * 100);
}

/** A number setting's value kept in range and on a whole step, as the board does it. */
export function fitNumber(value: number, min: number, max: number, step: number): number {
  const inRange = Math.min(max, Math.max(min, value));
  const stepped = Math.min(max, min + Math.round((inRange - min) / step) * step);
  // Steps such as 0.1 leave tails like 0.30000000000000004, which the board would not show.
  return Math.round(stepped * 100) / 100;
}
