// The help is split over several pages, while older links (in the editor, in posts or in print) still point at
// help.html#<section>. This says which page now holds each section, so those links keep working.

/** The topic pages in reading order, after the help home page help.html. */
export const HELP_PAGES = ["help-start", "help-path", "help-challenge", "help-tools", "help-hardware", "help-iot", "help-faq"] as const;

export type HelpPage = (typeof HELP_PAGES)[number];

const SECTION_PAGES: Record<string, HelpPage> = {
  start: "help-start",
  run: "help-start",
  browsers: "help-start",
  languages: "help-start",
  path: "help-path",
  challenge: "help-challenge",
  gemini: "help-tools",
  repl: "help-tools",
  plot: "help-tools",
  files: "help-tools",
  boards: "help-hardware",
  chips: "help-hardware",
  wiring: "help-hardware",
  parts: "help-hardware",
  "example-wiring": "help-hardware",
  voice: "help-iot",
  telegram: "help-iot",
  dashboard: "help-iot",
  "google-sheets": "help-iot",
  faq: "help-faq",
  "faq-connect": "help-faq",
  "faq-run": "help-faq",
  "faq-network": "help-faq",
  privacy: "help-faq",
  "shared-computer": "help-faq",
};

/** The page that holds a section or step, such as "dashboard" or "path-blink", or null for an unknown id. */
export function helpPageFor(id: string): HelpPage | null {
  if (id.startsWith("path-")) return "help-path";
  if (id.startsWith("challenge-")) return "help-challenge";
  return Object.hasOwn(SECTION_PAGES, id) ? SECTION_PAGES[id] : null;
}
