import { readdirSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { t } from "../../src/i18n";

const HAS_CJK = /[　-〿㐀-鿿＀-￯]/;
const FILES = readdirSync("src/examples").filter((file) => file.endsWith(".py"));

/** Loads a module again as an English page would, because the language is read once at load time. */
async function loadInEnglish<T>(path: string): Promise<T> {
  vi.resetModules();
  vi.stubGlobal("document", { documentElement: { lang: "en" } });
  return (await import(/* @vite-ignore */ path)) as T;
}

/** What the board actually runs: comments, page markup and message wording are allowed to differ. */
function programOf(code: string): string {
  return code
    .replace(/"""[\s\S]*?"""/g, '""')
    .replace(/"[^"\n]*"/g, '""')
    .replace(/#.*$/gm, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n+/g, "\n");
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("t", () => {
  it("keeps the Chinese wording on a Chinese page and fills in values", () => {
    expect(t("連接開發板")).toBe("連接開發板");
    expect(t("收到：{text}", { text: "開燈" })).toBe("收到：開燈");
  });

  it("uses English on an English page and fills in values", async () => {
    const english = await loadInEnglish<typeof import("../../src/i18n")>("../../src/i18n");
    expect(english.lang).toBe("en");
    expect(english.t("連接開發板")).toBe("Connect board");
    expect(english.t("收到：{text}", { text: "on" })).toBe("Received: on");
  });
});

describe("English examples", () => {
  it("exist for every example and contain no Chinese", () => {
    expect(readdirSync("src/examples/en").sort()).toEqual([...FILES].sort());
    for (const file of FILES) {
      const line = readFileSync(`src/examples/en/${file}`, "utf8").split("\n").find((text) => HAS_CJK.test(text));
      expect(line, file).toBeUndefined();
    }
  });

  it("run the same program as the Chinese ones", () => {
    for (const file of FILES) {
      const chinese = readFileSync(`src/examples/${file}`, "utf8");
      const english = readFileSync(`src/examples/en/${file}`, "utf8");
      expect(programOf(english), file).toBe(programOf(chinese));
    }
  });
});

describe("English text that reaches students and Gemini", () => {
  it("writes prompts in English", async () => {
    const { geminiPrompt, arduinoConvertPrompt, fixErrorPrompt } = await loadInEnglish<typeof import("../../src/text")>("../../src/text");
    const { CHIPS } = await import("../../src/chips");
    for (const prompt of [geminiPrompt(CHIPS.esp32.promptLines), geminiPrompt(CHIPS.esp32c3.promptLines), arduinoConvertPrompt("void setup() {}"), fixErrorPrompt("print(x)", "NameError")]) {
      expect(HAS_CJK.test(prompt), prompt).toBe(false);
    }
  });

  it("still hides secrets in the English prompts", async () => {
    const { fixErrorPrompt } = await loadInEnglish<typeof import("../../src/text")>("../../src/text");
    const prompt = fixErrorPrompt('PASSWORD = "secret"\n', "NameError");
    expect(prompt).not.toContain("secret");
  });

  it("adjusts the pins and wiring notes of an English example", async () => {
    const { adaptExamplePins, CHIPS } = await loadInEnglish<typeof import("../../src/chips")>("../../src/chips");
    const adapted = adaptExamplePins(readFileSync("src/examples/en/blink.py", "utf8"), CHIPS.esp32s3);
    expect(HAS_CJK.test(adapted)).toBe(false);
    expect(adapted).toContain("LED_PIN = 18");
    expect(adapted).not.toContain("blue");
    expect(adapted).toContain("the onboard LED pin differs between boards");
    expect(adapted.split("\n")[0]).toContain("ESP32-S3");
  });
});
