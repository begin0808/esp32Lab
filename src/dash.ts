import { lang } from "./i18n";
import chineseDash from "./lib/dash.py?raw";
import englishDash from "./lib/en/dash.py?raw";

/** Where the site saves the dashboard helper on the board. MicroPython looks in /lib for imports. */
export const DASH_PATH = "/lib/dash.py";

export const WIDGET_KINDS = ["value", "gauge", "chart", "led", "text", "switch", "button", "slider"] as const;
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
  color: LedColor;
}

const MAX_WIDGETS = 30;
const MAX_LABEL = 40;
const MAX_UNIT = 10;

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
    let min = finite(entry.min, 0);
    let max = finite(entry.max, 100);
    if (!(min < max)) [min, max] = [0, 100];
    widgets.push({
      id,
      kind,
      label: text(entry.l, MAX_LABEL) || id,
      unit: text(entry.u, MAX_UNIT),
      min,
      max,
      color: LED_COLORS.includes(entry.c as LedColor) ? (entry.c as LedColor) : "green",
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

/** A time such as 10:08:02, the same on every phone whatever its language. */
export function formatClock(date: Date): string {
  return [date.getHours(), date.getMinutes(), date.getSeconds()].map((part) => String(part).padStart(2, "0")).join(":");
}
