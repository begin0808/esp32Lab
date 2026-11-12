import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dashFile,
  dashTopic,
  findDashboardUrl,
  fitNumber,
  formatClock,
  formatDateTime,
  formatInfo,
  formatNumber,
  formatUptime,
  gaugeFraction,
  logCsv,
  parseColor,
  parseInfo,
  parseLayout,
  parseNumber,
  parseRows,
  stickVector,
  tiltVector,
  usesDash,
} from "../../src/dash";

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
      { id: "0g", kind: "gauge", label: "溫度", unit: "°C", min: 0, max: 50, step: 1, color: "green", options: [] },
      { id: "1l", kind: "led", label: "警報", unit: "", min: 0, max: 100, step: 1, color: "red", options: [] },
      { id: "2r", kind: "slider", label: "亮度", unit: "%", min: 0, max: 100, step: 1, color: "green", options: [] },
      { id: "3b", kind: "button", label: "響鈴", unit: "", min: 0, max: 100, step: 1, color: "green", options: [] },
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

  it("reads the new widgets, and keeps a select's options short and distinct", () => {
    const widgets = parseLayout(
      JSON.stringify({
        w: [
          { id: "0h", t: "color", l: "燈色" },
          { id: "1p", t: "pad", l: "方向" },
          { id: "2s", t: "select", l: "模式", o: ["關", "亮", "亮", "", 5, "x".repeat(30), "a", "b", "c", "d", "e", "f"] },
          { id: "3s", t: "select", l: "沒有選項", o: [] },
          { id: "4i", t: "input", l: "訊息" },
          { id: "5a", t: "alert", l: "門鈴" },
        ],
      }),
    )!;
    expect(widgets.map((widget) => widget.kind)).toEqual(["color", "pad", "select", "input", "alert"]);
    expect(widgets[2].options).toEqual(["關", "亮", "x".repeat(20), "a", "b", "c", "d", "e"]);
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

  it("reads only colours written as #rrggbb", () => {
    expect(parseColor("#FF8000")).toBe("#ff8000");
    expect(parseColor("red")).toBeNull();
    expect(parseColor("#ff80")).toBeNull();
    expect(parseColor("#ff8000;background:url(x)")).toBeNull();
  });

  it("writes chart times as hours, minutes and seconds", () => {
    expect(formatClock(new Date(2026, 10, 12, 10, 8, 2))).toBe("10:08:02");
    expect(formatClock(new Date(2026, 10, 12, 9, 5, 0))).toBe("09:05:00");
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
      .map((command) => spawnSync(command, ["-I", "-B", "-X", "utf8", "tests/dash/test_dash.py"], { encoding: "utf8" }))
      .find((run) => !run.error && run.status !== 9009 && !/not found|Microsoft Store/.test(run.stderr ?? ""));
    expect(result, "Python is needed for this test").toBeDefined();
    expect(result!.status, result!.stderr).toBe(0);
    expect(result!.stderr).toMatch(/Ran \d+ tests/);
  });
});

describe("card 13 widgets", () => {
  it("reads the new widgets from a layout, keeping log columns in place", () => {
    const widgets = parseLayout(
      JSON.stringify({
        v: 1,
        w: [
          { id: "0n", t: "number", l: "門檻", min: 20, max: 40, step: 0.5, u: "°C" },
          { id: "1o", t: "log", l: "紀錄", o: ["溫度", "溫度", "", "a", "b", "c", "d"] },
          { id: "2o", t: "log", l: "空的", o: [] },
          { id: "3m", t: "tilt", l: "傾斜" },
          { id: "4j", t: "joystick", l: "搖桿" },
          { id: "5n", t: "number", l: "壞的", step: -1 },
        ],
      }),
    )!;
    expect(widgets.map((widget) => widget.id)).toEqual(["0n", "1o", "3m", "4j", "5n"]);
    expect(widgets[0]).toMatchObject({ kind: "number", min: 20, max: 40, step: 0.5, unit: "°C" });
    expect(widgets[1].options).toEqual(["溫度", "溫度", "-", "a", "b", "c"]);
    expect(widgets[4].step).toBe(1);
  });

  it("keeps a number setting in range and on its steps", () => {
    expect(fitNumber(31.3, 20, 40, 0.5)).toBe(31.5);
    expect(fitNumber(99, 20, 40, 0.5)).toBe(40);
    expect(fitNumber(0.1 + 0.2, 0, 1, 0.1)).toBe(0.3);
    expect(fitNumber(-3, 0, 10, 3)).toBe(0);
  });

  it("reads log rows with one cell per column, and nothing that is not rows", () => {
    expect(parseRows("[[25.123, 60], [null, \"錯誤\", 9], [1]]", 2)).toEqual([["25.12", "60"], ["", "錯誤"], ["1", ""]]);
    expect(parseRows("[[1], 5, \"x\"]", 1)).toEqual([["1"]]);
    expect(parseRows("{}", 2)).toBeNull();
    expect(parseRows("not json", 2)).toBeNull();
    expect(parseRows(JSON.stringify(Array.from({ length: 30 }, (_, index) => [index])), 1)).toHaveLength(20);
  });

  it("writes a log as CSV that spreadsheets read, with numbers left as numbers", () => {
    const time = new Date(2026, 10, 13, 10, 8, 2).getTime();
    expect(formatDateTime(new Date(time))).toBe("2026-11-13 10:08:02");
    const csv = logCsv(["溫度", "說明"], [{ time, cells: ["-5", "=SUM(A1)"] }]);
    expect(csv).toBe("\ufeff時間,溫度,說明\r\n2026-11-13 10:08:02,-5,'=SUM(A1)\r\n");
  });

  it("reads the board's report and keeps only sensible numbers", () => {
    expect(parseInfo('{"r": -55, "u": 3725, "m": 87040}')).toEqual({ signal: -55, uptime: 3725, memory: 87040 });
    expect(parseInfo('{"r": "x", "u": -1, "m": 1e12}')).toEqual({ signal: null, uptime: null, memory: null });
    expect(parseInfo("[")).toBeNull();
    expect(formatInfo({ signal: -55, uptime: 3725, memory: 87040 })).toBe("Wi-Fi 訊號 -55 dBm（強）・已執行 1 小時 2 分・剩餘記憶體 85 KB");
    expect(formatInfo({ signal: -75, uptime: null, memory: null })).toBe("Wi-Fi 訊號 -75 dBm（弱）");
    expect(formatInfo({ signal: 0, uptime: null, memory: null })).toBe("");
    expect([5, 65, 3600 * 30].map(formatUptime)).toEqual(["5 秒", "1 分 5 秒", "1 天 6 小時"]);
  });

  it("turns tilt angles and joystick drags into -100 to 100 on each axis", () => {
    expect(tiltVector(0, 0)).toBe("0,0");
    // The top edge dipping 45 degrees is full forward; the right edge dipping is right.
    expect(tiltVector(-45, 22.5)).toBe("50,100");
    expect(tiltVector(90, -90)).toBe("-100,-100");
    expect(stickVector(0, -50, 100)).toBe("0,50");
    expect(stickVector(300, 0, 100)).toBe("100,0");
    expect(stickVector(100, 100, 100)).toBe("71,-71");
  });
});
