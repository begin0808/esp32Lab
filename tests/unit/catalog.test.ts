import { existsSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EXAMPLES, findExample, numberedName, type Example } from "../../src/catalog";

type Catalog = typeof import("../../src/catalog");

/** Loads the catalog again as an English page would, because the language is read once at load time. */
async function loadInEnglish(): Promise<Catalog> {
  vi.resetModules();
  vi.stubGlobal("document", { documentElement: { lang: "en" } });
  return (await import("../../src/catalog")) as Catalog;
}

/** The learning path's steps: the id of the example each one links to, its link text and its own id. */
function pathSteps(page: string): { example: string; text: string; step: string }[] {
  const html = readFileSync(page, "utf8");
  const section = html.slice(html.indexOf('<section id="path">'), html.indexOf('<section id="run">'));
  return [...section.matchAll(/<li id="([^"]+)"><a class="example-link" href="\.\/index\.html\?example=([a-z0-9_]+)">([^<]+)<\/a>/g)].map(
    ([, step, example, text]) => ({ example, text, step }),
  );
}

function expectEveryExampleOnce(steps: ReturnType<typeof pathSteps>, catalog: { EXAMPLES: Example[]; numberedName: (chosen: Example) => string }) {
  expect(steps.map((step) => step.example).sort()).toEqual(catalog.EXAMPLES.map((chosen) => chosen.id).sort());
  for (const step of steps) {
    const chosen = catalog.EXAMPLES.find((item) => item.id === step.example)!;
    // The link shows the same number and name as the editor's example menu.
    expect(step.text).toBe(catalog.numberedName(chosen));
    // The editor reopens the help page at #path-<id>, so the step must carry that id.
    expect(step.step).toBe(`path-${step.example}`);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("example catalog", () => {
  it("has 38 examples with distinct ids, each with a Chinese and an English file", () => {
    expect(EXAMPLES).toHaveLength(38);
    expect(new Set(EXAMPLES.map((chosen) => chosen.id)).size).toBe(38);
    for (const { id, code } of EXAMPLES) {
      expect(code, id).toBeTruthy();
      expect(existsSync(`src/examples/en/${id}.py`), id).toBe(true);
    }
  });

  it("finds an example by id and numbers it as the menu does", () => {
    expect(numberedName(findExample("blink")!)).toBe("1. LED 閃爍");
    expect(numberedName(findExample("asyncio_tasks")!)).toBe("26. asyncio 同時做三件事");
    expect(numberedName(findExample("dash_knob")!)).toBe("29. 滑桿調 LED 亮度、看可變電阻");
    expect(numberedName(findExample("dash_doorbell")!)).toBe("34. 按鈕門鈴通知手機");
    expect(numberedName(findExample("dash_joycar")!)).toBe("38. 手機搖桿遙控車");
    expect(findExample("nothing")).toBeUndefined();
  });
});

describe("learning path on the help page", () => {
  it("links every example once, by the menu's name, on the Chinese page", () => {
    expectEveryExampleOnce(pathSteps("help.html"), { EXAMPLES, numberedName });
  });

  it("links every example once, by the menu's name, on the English page", async () => {
    const english = await loadInEnglish();
    expect(english.numberedName(english.findExample("blink")!)).toBe("1. Blink an LED");
    expectEveryExampleOnce(pathSteps("help.en.html"), english);
  });

  it("gives both pages the same steps in the same order", () => {
    expect(pathSteps("help.en.html").map((step) => step.example)).toEqual(pathSteps("help.html").map((step) => step.example));
  });
});
