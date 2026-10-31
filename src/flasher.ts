import { chipFromName, type Chip } from "./chips";

const MIN_FLASH_MB = 4;
const FLASH_BAUD = 460800;
const ROM_BAUD = 115200;

export interface FlashCallbacks {
  onLog: (line: string) => void;
  onStage: (label: string) => void;
  onProgress: (fraction: number) => void;
}

/** Returns true when esptool's size string (such as "4MB") is smaller than the firmware requires. */
export function isFlashTooSmall(size: string | undefined): boolean {
  const match = size?.match(/^(\d+)(KB|MB)$/);
  if (!match) return false;
  const megabytes = match[2] === "KB" ? Number(match[1]) / 1024 : Number(match[1]);
  return megabytes < MIN_FLASH_MB;
}

export async function verifySha256(data: Uint8Array, expected: string): Promise<boolean> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data as BufferSource));
  const hex = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return hex === expected;
}

async function loadFirmware(chip: Chip): Promise<Uint8Array> {
  const response = await fetch(chip.firmware.url);
  if (!response.ok) throw new Error(`無法下載韌體（HTTP ${response.status}）`);
  const data = new Uint8Array(await response.arrayBuffer());
  if (!(await verifySha256(data, chip.firmware.sha256))) {
    throw new Error("韌體檔案驗證失敗，請重新整理網頁再試一次");
  }
  return data;
}

/**
 * Erases the board and installs the MicroPython build for its chip.
 * The port must be closed; it is closed again on return.
 */
export async function installFirmware(port: SerialPort, callbacks: FlashCallbacks): Promise<Chip> {
  const { ESPLoader, Transport } = await import("esptool-js");
  const transport = new Transport(port, false);
  const loader = new ESPLoader({
    transport,
    baudrate: FLASH_BAUD,
    romBaudrate: ROM_BAUD,
    terminal: {
      clean: () => {},
      write: () => {},
      writeLine: callbacks.onLog,
    },
  });

  try {
    callbacks.onStage("正在連接開發板（連不上時請按住 IO0 鍵）");
    await loader.main();

    // Refuse before erasing anything: a board without a matching firmware must stay untouched.
    const chip = chipFromName(loader.chip.CHIP_NAME);
    if (!chip) {
      throw new Error(`這塊板子是 ${loader.chip.CHIP_NAME}，目前只支援經典 ESP32、ESP32-S2、S3 和 C3`);
    }
    const flashSize = await loader.detectFlashSize();
    if (isFlashTooSmall(flashSize)) {
      throw new Error(`快閃記憶體只有 ${flashSize}，至少需要 ${MIN_FLASH_MB}MB`);
    }

    callbacks.onStage(`正在下載 ${chip.label} 的韌體`);
    const firmware = await loadFirmware(chip);

    callbacks.onStage("正在清除快閃記憶體");
    await loader.eraseFlash();

    callbacks.onStage("正在寫入韌體");
    await loader.writeFlash({
      fileArray: [{ data: firmware, address: chip.firmware.address }],
      flashMode: "keep",
      flashFreq: "keep",
      flashSize: "keep",
      eraseAll: false,
      compress: true,
      reportProgress: (_file, written, total) => callbacks.onProgress(written / total),
    });

    callbacks.onStage("正在重新啟動");
    await loader.after("hard_reset");
    return chip;
  } finally {
    await transport.disconnect().catch(() => {});
  }
}
