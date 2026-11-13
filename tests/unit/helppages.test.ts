import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HELP_PAGES, helpPageFor } from "../../src/helppages";

// Parts of the page frame, not sections a link would point at.
const FRAME_IDS = new Set(["home-link", "style-picker", "language-picker", "visit-count", "to-top"]);
const HOME_IDS = new Set(["micropython-notice", "feedback-notice", "guide"]);

const ids = (file: string) => [...readFileSync(file, "utf8").matchAll(/\sid="([^"]+)"/g)].map(([, id]) => id).filter((id) => !FRAME_IDS.has(id));
const pageFiles = (ext: string) => ["help", ...HELP_PAGES].map((page) => `${page}${ext}.html`);

describe("help pages", () => {
  it("are exactly the home page and the listed topic pages, in both languages", () => {
    const found = readdirSync(".").filter((name) => /^help.*\.html$/.test(name)).sort();
    expect(found).toEqual([...pageFiles(""), ...pageFiles(".en")].sort());
  });

  it("send every section and step to the page that holds it, so old help.html#… links keep working", () => {
    for (const ext of ["", ".en"]) {
      for (const page of HELP_PAGES) {
        for (const id of ids(`${page}${ext}.html`)) expect(helpPageFor(id), `${page}${ext} #${id}`).toBe(page);
      }
      for (const id of ids(`help${ext}.html`)) expect(HOME_IDS.has(id), `help${ext} #${id}`).toBe(true);
    }
    expect(helpPageFor("nothing")).toBeNull();
    expect(helpPageFor("toString")).toBeNull();
  });

  it("have no links to a section that is not there", () => {
    for (const ext of ["", ".en"]) {
      for (const file of pageFiles(ext)) {
        const html = readFileSync(file, "utf8");
        for (const [, target, id] of html.matchAll(/href="(?:\.\/(help(?:-[a-z]+)?(?:\.en)?\.html))?#([^"]+)"/g)) {
          const home = target ?? file;
          expect(target === undefined || target.endsWith(`${ext}.html`), `${file} → ${target}`).toBe(true);
          expect(ids(home).includes(id) || FRAME_IDS.has(id), `${file} → ${home}#${id}`).toBe(true);
        }
      }
    }
  });

  it("have the same sections in Chinese and English", () => {
    for (const page of ["help", ...HELP_PAGES]) expect(ids(`${page}.en.html`), page).toEqual(ids(`${page}.html`));
  });

  it("each have one title and one description, with no quote breaking the description", () => {
    for (const ext of ["", ".en"]) {
      for (const file of pageFiles(ext)) {
        const html = readFileSync(file, "utf8");
        expect(html.match(/<title>[^<]+<\/title>/g), file).toHaveLength(1);
        expect(html.match(/<meta name="description" content="[^"<>]+" \/>/g), file).toHaveLength(1);
      }
    }
    expect(new Set(pageFiles("").map((file) => readFileSync(file, "utf8").match(/<title>([^<]+)<\/title>/)![1])).size).toBe(HELP_PAGES.length + 1);
  });

  it("open the English version of the same page for English readers", () => {
    for (const page of ["help", ...HELP_PAGES]) {
      expect(readFileSync(`${page}.html`, "utf8"), page).toContain(`location.replace("./${page}.en.html" + location.hash)`);
    }
  });
});
