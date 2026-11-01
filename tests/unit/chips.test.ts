import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { adaptExamplePins, chipFromMachine, chipFromName, CHIPS } from "../../src/chips";
import { geminiPrompt } from "../../src/text";

const EXAMPLES = ["src/examples", "src/examples/en"].flatMap((dir) =>
  readdirSync(dir)
    .filter((file) => file.endsWith(".py"))
    .map((file) => ({ file: `${dir}/${file}`.replace("src/examples/", ""), code: readFileSync(`${dir}/${file}`, "utf8") })),
);

function pinsOf(code: string): Map<string, number> {
  return new Map([...code.matchAll(/^(\w*_PIN) = (\d+)/gm)].map((match) => [match[1], Number(match[2])]));
}

const UNSAFE: Record<string, number[]> = {
  // Boot-mode pins, USB and internal flash or PSRAM.
  esp32s2: [0, 19, 20, 26, 27, 28, 29, 30, 31, 32, 45, 46],
  esp32s3: [0, 3, 19, 20, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 45, 46],
  esp32c3: [2, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21],
};
// Analog pins that keep working while Wi-Fi is on.
const ANALOG_MAX: Record<string, number> = { esp32s2: 10, esp32s3: 10, esp32c3: 4 };
const ANALOG_NAMES = ["SENSOR_PIN", "KNOB_PIN"];

describe("adaptExamplePins", () => {
  for (const id of ["esp32s2", "esp32s3", "esp32c3"] as const) {
    const chip = CHIPS[id];
    for (const { file, code } of EXAMPLES) {
      it(`${file} fits ${chip.label}`, () => {
        const adapted = adaptExamplePins(code, chip);
        const pins = pinsOf(adapted);
        const values = [...pins.values()];
        expect(new Set(values).size).toBe(values.length);
        for (const value of values) expect(UNSAFE[id]).not.toContain(value);
        for (const name of ANALOG_NAMES) {
          if (pins.has(name)) expect(pins.get(name)).toBeLessThanOrEqual(ANALOG_MAX[id]);
        }
        // Every pin named in the wiring notes must be one the program really uses or a suggestion that also moved.
        for (const match of code.matchAll(/\bGPIO (\d+)/g)) expect(chip.pins).toHaveProperty(match[1]);
        for (const [name, value] of pinsOf(code)) {
          expect(pins.get(name)).toBe(chip.pins![value]);
        }
      });
    }
  }

  it("keeps the wiring notes in step with the program", () => {
    const code = EXAMPLES.find(({ file }) => file === "button_led.py")!.code;
    const adapted = adaptExamplePins(code, CHIPS.esp32c3);
    expect(adapted).toContain("LED_PIN = 4");
    expect(adapted).toContain("BUTTON_PIN = 5");
    expect(adapted).toContain("按鈕一腳接 GPIO 5");
    expect(adapted).toContain("接 GPIO 4");
    expect(adapted).not.toContain("GPIO 18");
    expect(adapted.split("\n")[0]).toContain("ESP32-C3");
  });

  it("asks for a wired LED where the onboard LED is unknown", () => {
    const code = EXAMPLES.find(({ file }) => file === "blink.py")!.code;
    const adapted = adaptExamplePins(code, CHIPS.esp32s3);
    expect(adapted).toContain("LED_PIN = 18");
    expect(adapted).not.toContain("藍色");
    expect(adapted).toContain("各板子的板載 LED 腳位不同");
  });

  it("leaves the classic ESP32 examples alone", () => {
    for (const { code } of EXAMPLES) expect(adaptExamplePins(code, CHIPS.esp32)).toBe(code);
  });
});

describe("chip lookup", () => {
  it("reads MicroPython's board description", () => {
    expect(chipFromMachine("Generic ESP32 module with ESP32")?.id).toBe("esp32");
    expect(chipFromMachine("Generic ESP32S2 module with ESP32S2")?.id).toBe("esp32s2");
    expect(chipFromMachine("Generic ESP32S3 module with ESP32S3")?.id).toBe("esp32s3");
    expect(chipFromMachine("ESP32C3 module with ESP32C3")?.id).toBe("esp32c3");
    expect(chipFromMachine("ESP32C6 module with ESP32C6")).toBeNull();
    expect(chipFromMachine("Raspberry Pi Pico with RP2040")).toBeNull();
  });

  it("refuses chips that have no firmware", () => {
    expect(chipFromName("ESP32-S3")?.id).toBe("esp32s3");
    expect(chipFromName("ESP32-C6")).toBeNull();
    expect(chipFromName("ESP32-H2")).toBeNull();
  });
});

describe("firmware files", () => {
  // The chip ID stored in every ESP-IDF image header, at byte 12.
  const IMAGE_CHIP_IDS: Record<string, number> = { esp32: 0, esp32s2: 2, esp32s3: 9, esp32c3: 5 };

  for (const chip of Object.values(CHIPS)) {
    it(`${chip.label} has the right image at the right address`, () => {
      const data = readFileSync(`public/firmware/${chip.firmware.url.split("/").pop()}`);
      expect(createHash("sha256").update(data).digest("hex")).toBe(chip.firmware.sha256);
      expect(data[0]).toBe(0xe9);
      expect(data[12]).toBe(IMAGE_CHIP_IDS[chip.id]);
      // Official MicroPython instructions: S2 and classic at 0x1000, S3 and C3 at 0.
      expect(chip.firmware.address).toBe(chip.id === "esp32" || chip.id === "esp32s2" ? 0x1000 : 0);
    });
  }
});

describe("geminiPrompt", () => {
  it("names the chosen board", () => {
    expect(geminiPrompt(CHIPS.esp32.promptLines)).toContain("板載 LED：GPIO 2");
    const c3 = geminiPrompt(CHIPS.esp32c3.promptLines);
    expect(c3).toContain("開發板：ESP32-C3");
    expect(c3).not.toContain("GPIO 2\n");
  });
});
