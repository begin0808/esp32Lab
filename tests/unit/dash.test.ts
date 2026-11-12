import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dashFile, dashTopic, findDashboardUrl, formatNumber, gaugeFraction, parseLayout, parseNumber, usesDash } from "../../src/dash";

const HAS_CJK = /[　-〿㐀-鿿＀-￯]/;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("dashboard topics and programs", () => {
  it("puts every topic under the board's own topic name", () => {
    expect(dashTopic("dash-1", "layout")).toBe("esp32-mp-class/dash-1/dash/layout");
    expect(dashTopic("dash-1", "in/0w")).toBe("esp32-mp-class/dash-1/dash/in/0w");
  });

  it("notices a program that imports dash, but not one that only mentions it", () => {
    expect(usesDash("import time\nimport dash\n")).toBe(true);
    expect(usesDash("from dash import Dashboard\n")).toBe(true);
    expect(usesDash("  import dash  # indented in a block\n")).toBe(true);
    expect(usesDash("# import dash later\nimport dashboard\n")).toBe(false);
    expect(usesDash('print("import dash")\n')).toBe(false);
  });

  it("fills in the dashboard page and gives the same bytes whatever the line ends", () => {
    const file = dashFile("https://example.test/dashboard.html");
    expect(file).toContain('PAGE = "https://example.test/dashboard.html"');
    expect(file).not.toContain("{{");
    expect(file).not.toContain("\r");
  });

  it("gives an English page the English helper", async () => {
    vi.stubGlobal("document", { documentElement: { lang: "en" } });
    const english = (await import("../../src/dash")) as typeof import("../../src/dash");
    expect(HAS_CJK.test(english.dashFile("https://x/dashboard.html"))).toBe(false);
  });

  it("finds the address the board prints, and only a whole topic name", () => {
    const line = "手機儀表板： https://begin0808.github.io/esp32Lab/dashboard.html?ch=dash-0a1b2c\r\n";
    expect(findDashboardUrl(line)).toBe("https://begin0808.github.io/esp32Lab/dashboard.html?ch=dash-0a1b2c");
    expect(findDashboardUrl("Phone dashboard: http://localhost:5173/dashboard.html?ch=abc\n")).toBe("http://localhost:5173/dashboard.html?ch=abc");
    expect(findDashboardUrl("https://x/dashboard.html?ch=")).toBeNull();
    expect(findDashboardUrl(`https://x/dashboard.html?ch=${"a".repeat(33)}`)).toBeNull();
    expect(findDashboardUrl("javascript:alert(1)//dashboard.html?ch=abc")).toBeNull();
  });
});

describe("parseLayout", () => {
  it("reads every kind of widget with its options", () => {
    const layout = JSON.stringify({
      v: 1,
      w: [
        { id: "0g", t: "gauge", l: "溫度", min: 0, max: 50, u: "°C" },
        { id: "1l", t: "led", l: "警報", c: "red" },
        { id: "2r", t: "slider", l: "亮度", min: 0, max: 100, u: "%" },
        { id: "3b", t: "button", l: "響鈴" },
      ],
    });
    expect(parseLayout(layout)).toEqual([
      { id: "0g", kind: "gauge", label: "溫度", unit: "°C", min: 0, max: 50, color: "green" },
      { id: "1l", kind: "led", label: "警報", unit: "", min: 0, max: 100, color: "red" },
      { id: "2r", kind: "slider", label: "亮度", unit: "%", min: 0, max: 100, color: "green" },
      { id: "3b", kind: "button", label: "響鈴", unit: "", min: 0, max: 100, color: "green" },
    ]);
  });

  it("drops anything a stranger on the public broker could send", () => {
    expect(parseLayout("not json")).toBeNull();
    expect(parseLayout("[]")).toBeNull();
    expect(parseLayout('{"w": 3}')).toBeNull();
    const widgets = parseLayout(
      JSON.stringify({
        w: [
          { id: "0x", t: "script", l: "bad kind" },
          { id: "../in", t: "value", l: "bad id" },
          { id: "1v", t: "value", l: "<img src=x onerror=alert(1)>" },
          { id: "1v", t: "value", l: "same id twice" },
          { id: "2g", t: "gauge", l: "x".repeat(100), min: 9, max: 1, u: "a very long unit text" },
          { id: "3l", t: "led", c: "url(evil)" },
          null,
        ],
      }),
    )!;
    expect(widgets.map((widget) => widget.id)).toEqual(["1v", "2g", "3l"]);
    // The page shows labels as text, never as markup.
    expect(widgets[0].label).toBe("<img src=x onerror=alert(1)>");
    expect(widgets[1]).toMatchObject({ label: "x".repeat(40), min: 0, max: 100, unit: "a very lon" });
    expect(widgets[2]).toMatchObject({ label: "3l", color: "green" });
  });

  it("keeps at most 30 widgets", () => {
    const w = Array.from({ length: 40 }, (_, index) => ({ id: `${index}v`, t: "value", l: String(index) }));
    expect(parseLayout(JSON.stringify({ w }))).toHaveLength(30);
  });
});

describe("numbers on the dashboard", () => {
  it("reads only plain numbers", () => {
    expect(parseNumber("25")).toBe(25);
    expect(parseNumber("-3.5")).toBe(-3.5);
    expect(parseNumber("1e3")).toBe(1000);
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("溫度正常")).toBeNull();
    expect(parseNumber("12abc")).toBeNull();
    expect(parseNumber("Infinity")).toBeNull();
  });

  it("places a value on the gauge, even outside its range", () => {
    expect(gaugeFraction(25, 0, 50)).toBe(0.5);
    expect(gaugeFraction(-10, 0, 50)).toBe(0);
    expect(gaugeFraction(80, 0, 50)).toBe(1);
  });

  it("shows at most two decimals", () => {
    expect(formatNumber(25.123456)).toBe("25.12");
    expect(formatNumber(3)).toBe("3");
  });
});

describe("dash.py on the board", () => {
  it("runs the same program in both languages", () => {
    const program = (path: string) =>
      readFileSync(path, "utf8")
        .replace(/\r\n/g, "\n")
        .replace(/"[^"\n]*"/g, '""')
        .replace(/#.*$/gm, "")
        .replace(/[ \t]+$/gm, "")
        .replace(/\n+/g, "\n");
    expect(program("src/lib/en/dash.py")).toBe(program("src/lib/dash.py"));
    expect(HAS_CJK.test(readFileSync("src/lib/en/dash.py", "utf8"))).toBe(false);
  });

  it("passes its own tests on Python, with fake Wi-Fi, MQTT and clock", () => {
    // Python is called python3 on Linux and usually python on Windows.
    const result = ["python3", "python"]
      .map((command) => spawnSync(command, ["-I", "-X", "utf8", "tests/dash/test_dash.py"], { encoding: "utf8" }))
      .find((run) => !run.error && run.status !== 9009 && !/not found|Microsoft Store/.test(run.stderr ?? ""));
    expect(result, "Python is needed for this test").toBeDefined();
    expect(result!.status, result!.stderr).toBe(0);
    expect(result!.stderr).toMatch(/Ran \d+ tests/);
  });
});
