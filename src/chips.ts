export type ChipId = "esp32" | "esp32s2" | "esp32s3" | "esp32c3";

export interface Chip {
  id: ChipId;
  /** The name esptool-js reports for this chip. */
  name: string;
  label: string;
  firmware: { url: string; sha256: string; address: number };
  /** Where each pin of the classic ESP32 examples moves to. Null means the examples fit as written. */
  pins: Record<number, number> | null;
  promptLines: string;
}

export const FIRMWARE_VERSION = "MicroPython v1.29.0";

// S2 and S3: GPIO 19 and 20 are USB, and only GPIO 1-10 can read analog values while Wi-Fi is on.
const S2_S3_PINS = { 2: 18, 4: 4, 5: 10, 13: 13, 16: 16, 18: 18, 19: 17, 21: 8, 22: 9, 23: 11, 25: 14, 26: 11, 27: 12, 33: 12, 34: 1 };
// C3 has few free pins, so examples share them: no single example uses the same one twice.
// GPIO 18 and 19 are USB, GPIO 11-17 are flash, and only GPIO 0-4 can read analog values while Wi-Fi is on.
const C3_PINS = { 2: 4, 4: 5, 5: 7, 13: 6, 16: 6, 18: 4, 19: 5, 21: 6, 22: 7, 23: 6, 25: 6, 26: 6, 27: 7, 33: 7, 34: 3 };

function promptLines(label: string): string {
  return `- 開發板：${label}（MicroPython v1.29.0）
- 板載 LED：（請看板子標示填寫，不同板子的腳位不同）`;
}

export const CHIPS: Record<ChipId, Chip> = {
  esp32: {
    id: "esp32",
    name: "ESP32",
    label: "經典 ESP32",
    firmware: {
      url: "./firmware/ESP32_GENERIC-20260824-v1.29.0.bin",
      sha256: "e67ad6015a0a504c1fec9aa9bbf589d0432ed28e62546f4f8dd8a147f8bd95f6",
      address: 0x1000,
    },
    pins: null,
    promptLines: `- 開發板：NodeMCU ESP-32S（經典 ESP32，MicroPython v1.29.0）
- 板載 LED：GPIO 2`,
  },
  esp32s2: {
    id: "esp32s2",
    name: "ESP32-S2",
    label: "ESP32-S2",
    firmware: {
      url: "./firmware/ESP32_GENERIC_S2-20260824-v1.29.0.bin",
      sha256: "c7e30ea6978437432cbb6233886a8037db766e84d6ae844acb6ed20d00cf5873",
      address: 0x1000,
    },
    pins: S2_S3_PINS,
    promptLines: promptLines("ESP32-S2"),
  },
  esp32s3: {
    id: "esp32s3",
    name: "ESP32-S3",
    label: "ESP32-S3",
    firmware: {
      url: "./firmware/ESP32_GENERIC_S3-20260824-v1.29.0.bin",
      sha256: "1dd9dcd27ba2d6a1cb7f7b49a063f46d3d807d68b0151161233920228285e300",
      address: 0x0,
    },
    pins: S2_S3_PINS,
    promptLines: promptLines("ESP32-S3"),
  },
  esp32c3: {
    id: "esp32c3",
    name: "ESP32-C3",
    label: "ESP32-C3",
    firmware: {
      url: "./firmware/ESP32_GENERIC_C3-20260824-v1.29.0.bin",
      sha256: "bf72ed9eb88ad3a8f49d02c3d371f9ea34c90a8a303aeb9e324d8efd4a2a655a",
      address: 0x0,
    },
    pins: C3_PINS,
    promptLines: promptLines("ESP32-C3"),
  },
};

export function isChipId(value: unknown): value is ChipId {
  return typeof value === "string" && value in CHIPS;
}

/** Looks a chip up by the name esptool-js reports, such as "ESP32-S3". */
export function chipFromName(name: string): Chip | null {
  return Object.values(CHIPS).find((chip) => chip.name === name) ?? null;
}

/** Reads the chip from MicroPython's description, such as "Generic ESP32S3 module with ESP32S3". */
export function chipFromMachine(machine: string): Chip | null {
  const match = machine.match(/with ESP32(\w*)\s*$/i);
  if (!match) return null;
  return chipFromName(match[1] ? `ESP32-${match[1].toUpperCase()}` : "ESP32");
}

/** Rewrites an example's pins for the chosen chip, including the wiring notes in its comments. */
export function adaptExamplePins(code: string, chip: Chip): string {
  const pins = chip.pins;
  if (!pins) return code;
  const move = (pin: string) => String(pins[Number(pin)] ?? pin);
  const adapted = code
    .replace(/\bGPIO (\d+)/g, (_match, pin: string) => `GPIO ${move(pin)}`)
    .replace(/^(\w*_PIN = )(\d+)/gm, (_match, name: string, pin: string) => `${name}${move(pin)}`)
    // Each board puts its onboard LED somewhere else, so this example needs a wired LED instead.
    .replace(/^# .*板載.*$/m, `# 接線：LED 經 220Ω 電阻接 GPIO ${pins[2]}，短腳接 GND（各板子的板載 LED 腳位不同）`);
  return `# 腳位已依 ${chip.label} 調整。不同板子引出的腳位可能不同，請對照板子標示\n${adapted}`;
}
