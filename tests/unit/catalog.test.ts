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

/** Each challenge project's id, the example numbers its overview row lists, and the example links in its own part. */
function challenges(page: string): { id: string; listed: number[]; linked: { example: string; number: number }[] }[] {
  const html = readFileSync(page, "utf8");
  const section = html.slice(html.indexOf('<section id="challenge">'), html.indexOf('<section id="run">'));
  return [...section.matchAll(/<tr><td><a href="#challenge-([a-z-]+)">[^<]+<\/a><\/td><td>★+<\/td><td>([^<]+)<\/td><\/tr>/g)].map(([, id, numbers]) => {
    const part = section.slice(section.indexOf(`<h3 id="challenge-${id}">`)).split("<h3")[1];
    return {
      id,
      listed: numbers.split(/[、,]\s*/).map(Number),
      linked: [...part.matchAll(/<a href="#path-([a-z0-9_]+)">(\d+)<\/a>/g)].map(([, example, number]) => ({ example, number: Number(number) })),
    };
  });
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
    expect(numberedName(findExample("dash_knob")!)).toBe("29. 旋鈕和手機滑桿一起調 LED 亮度");
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

  it("states how many examples there are, so the count keeps up with new ones", () => {
    expect(readFileSync("help.html", "utf8")).toContain(`<p>${EXAMPLES.length} 個範例分成初階、中階、進階三級`);
    expect(readFileSync("help.en.html", "utf8")).toContain(`<p>The ${EXAMPLES.length} examples are arranged in three levels`);
  });
});

describe("challenge projects on the help page", () => {
  it("link each example by its own number, and list the same examples in the overview", () => {
    for (const page of ["help.html", "help.en.html"]) {
      const projects = challenges(page);
      expect(projects.length, page).toBe(6);
      for (const { id, listed, linked } of projects) {
        expect(linked.length, `${page} ${id}`).toBeGreaterThan(0);
        for (const { example, number } of linked) {
          const chosen = findExample(example);
          expect(chosen, `${page} ${id} ${example}`).toBeDefined();
          expect(EXAMPLES.indexOf(chosen!) + 1, `${page} ${id} ${example}`).toBe(number);
        }
        expect(linked.map((link) => link.number), `${page} ${id}`).toEqual(listed);
      }
    }
  });

  it("gives both pages the same projects with the same examples", () => {
    expect(challenges("help.en.html")).toEqual(challenges("help.html"));
  });
});
