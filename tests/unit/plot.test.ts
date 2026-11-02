import { describe, expect, it } from "vitest";
import { csvFileName, DataLog, firstIndexFrom, formatValue, LineBuffer, MAX_ROWS, MAX_SERIES, niceStep, parseDataLine } from "../../src/plot";

const unnamed = (position: number) => `數值${position}`;
const parse = (line: string) => parseDataLine(line, unnamed);

describe("parseDataLine", () => {
  it("reads what the examples print, ignoring units", () => {
    expect(parse("溫度: 25 °C  濕度: 60 %")).toEqual([
      { name: "溫度", value: 25 },
      { name: "濕度", value: 60 },
    ]);
    expect(parse("Temperature: 25 °C  Humidity: 60 %")).toEqual([
      { name: "Temperature", value: 25 },
      { name: "Humidity", value: 60 },
    ]);
    expect(parse("距離: 12.3 公分")).toEqual([{ name: "距離", value: 12.3 }]);
    expect(parse("溫度: 23.50 °C")).toEqual([{ name: "溫度", value: 23.5 }]);
    expect(parse("旋鈕: 50 %")).toEqual([{ name: "旋鈕", value: 50 }]);
    expect(parse("亮度: 30000 LED: 亮")).toEqual([{ name: "亮度", value: 30000 }]);
  });

  it("accepts equals signs, full-width colons, commas and negative numbers", () => {
    expect(parse("x=1,y=-2.5")).toEqual([
      { name: "x", value: 1 },
      { name: "y", value: -2.5 },
    ]);
    expect(parse("溫度：-3")).toEqual([{ name: "溫度", value: -3 }]);
    expect(parse("ax:0.01 ay:-0.98 az:1e-3")).toEqual([
      { name: "ax", value: 0.01 },
      { name: "ay", value: -0.98 },
      { name: "az", value: 0.001 },
    ]);
  });

  it("names a line of plain numbers by position", () => {
    expect(parse("25 60")).toEqual([
      { name: "數值1", value: 25 },
      { name: "數值2", value: 60 },
    ]);
    expect(parse("1.5, -2\t3")).toEqual([
      { name: "數值1", value: 1.5 },
      { name: "數值2", value: -2 },
      { name: "數值3", value: 3 },
    ]);
  });

  it("ignores messages, prompts, errors and pasted blocks", () => {
    for (const line of [
      "",
      "讀取失敗，請檢查接線",
      "reading 28160 49493",
      ">>> 1+1",
      "... print(i)",
      "=== x = 5",
      "Traceback (most recent call last):",
      '  File "main.py", line 5, in <module>',
      "KeyboardInterrupt: ",
      "OSError: -202",
      "MicroPython v1.29.0 on 2026-08-24; Generic ESP32 module with ESP32",
      "Web server started, IP address: 192.168.1.5",
      "時間 12:30:45",
    ]) {
      expect(parse(line), line).toBeNull();
    }
  });

  it("ignores the chip's own report after a reset", () => {
    for (const line of [
      "rst:0x1 (POWERON_RESET),boot:0x13 (SPI_FAST_FLASH_BOOT)",
      "configsip: 0, SPIWP:0xee",
      "mode:DIO, clock div:2",
      "load:0x3fff0030,len:4728",
      "ho 0 tail 12 room 4",
      "entry 0x400805cc",
    ]) {
      expect(parse(line), line).toBeNull();
    }
  });
});

describe("LineBuffer", () => {
  it("keeps a line that has not ended until the rest arrives", () => {
    const buffer = new LineBuffer();
    expect(buffer.push("溫度: 2")).toEqual([]);
    expect(buffer.push("5\r\n濕度")).toEqual(["溫度: 25"]);
    expect(buffer.push(": 60\r\n")).toEqual(["濕度: 60"]);
  });
});

describe("DataLog", () => {
  it("keeps times from the first value and leaves gaps where a name was not printed", () => {
    const log = new DataLog();
    log.add(1000, [{ name: "a", value: 1 }]);
    log.add(1500, [{ name: "b", value: 2 }]);
    log.add(2250, [
      { name: "a", value: 3 },
      { name: "b", value: 4 },
    ]);
    expect(log.times).toEqual([0, 500, 1250]);
    expect(log.series.map((series) => [series.name, series.values])).toEqual([
      ["a", [1, undefined, 3]],
      ["b", [undefined, 2, 4]],
    ]);
    expect(log.latest(log.series[1])).toBe(4);
  });

  it("writes CSV that Excel opens with Chinese names and empty cells for gaps", () => {
    const log = new DataLog();
    log.add(0, [{ name: "溫度", value: 25 }]);
    log.add(1234, [{ name: "濕度", value: 60.5 }]);
    expect(log.toCsv("時間（秒）")).toBe("﻿時間（秒）,溫度,濕度\r\n0.000,25,\r\n1.234,,60.5\r\n");
  });

  it("quotes names that would confuse a spreadsheet", () => {
    const log = new DataLog();
    log.add(0, [{ name: "-x", value: 1 }]);
    log.add(0, [{ name: 'a"b', value: 2 }]);
    expect(log.toCsv("t").split("\r\n")[0]).toBe(`﻿t,'-x,"a""b"`);
  });

  it("stops adding new names after the last colour is used", () => {
    const log = new DataLog();
    const names = Array.from({ length: MAX_SERIES + 1 }, (_, index) => ({ name: `s${index}`, value: index }));
    expect(log.add(0, names)).toBe(true);
    expect(log.series).toHaveLength(MAX_SERIES);
    expect(log.add(1, [{ name: `s${MAX_SERIES}`, value: 1 }])).toBe(false);
    expect(log.rowCount).toBe(1);
  });

  it("drops the oldest rows once it holds too many", () => {
    const log = new DataLog();
    for (let index = 0; index < MAX_ROWS * 1.2; index++) log.add(index, [{ name: "a", value: index }]);
    expect(log.rowCount).toBeLessThanOrEqual(MAX_ROWS * 1.1);
    expect(log.dropped).toBeGreaterThan(0);
    expect(log.series[0].values[0]).toBe(log.dropped);
    expect(log.times[0]).toBe(log.dropped);
  });

  it("starts over after clearing", () => {
    const log = new DataLog();
    log.add(5000, [{ name: "a", value: 1 }]);
    log.clear();
    log.add(9000, [{ name: "b", value: 2 }]);
    expect(log.times).toEqual([0]);
    expect(log.series.map((series) => series.name)).toEqual(["b"]);
  });
});

describe("chart helpers", () => {
  it("finds the first time inside the window", () => {
    expect(firstIndexFrom([0, 10, 20, 30], 15)).toBe(2);
    expect(firstIndexFrom([0, 10, 20, 30], 20)).toBe(2);
    expect(firstIndexFrom([0, 10, 20, 30], 99)).toBe(4);
  });

  it("chooses round gaps between grid lines", () => {
    expect(niceStep(60, 6)).toBe(10);
    expect(niceStep(1, 5)).toBeCloseTo(0.2);
    expect(niceStep(37, 4)).toBe(10);
    expect(niceStep(0, 4)).toBe(1);
  });

  it("shows values without floating-point tails", () => {
    expect(formatValue(0.1 + 0.2)).toBe("0.3");
    expect(formatValue(25)).toBe("25");
  });

  it("names the CSV file after the local date and time", () => {
    expect(csvFileName(new Date(2026, 10, 3, 14, 5, 9))).toBe("esp32-data-20261103-140509.csv");
  });
});
