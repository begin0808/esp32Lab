import { chipFromName, type Chip } from "./chips";
import { t } from "./i18n";

const MIN_FLASH_MB = 4;
const FLASH_BAUD = 460800;
const ROM_BAUD = 115200;
// The auto-reset circuit sometimes restarts the program instead of entering the bootloader.
// On the Arduino edition, reopening the port worked where more resets in a row did not, so each try is short.
const CONNECT_TRIES = 6;
// Built-in USB usually drops the port when the chip resets, so more tries would only delay the BOOT and RST advice.
const NATIVE_USB_CONNECT_TRIES = 2;
const RESETS_PER_TRY = 2;
const PAUSE_BEFORE_TRY_MS = 500;
const ESPRESSIF_VENDOR_ID = 0x303a;
const DETAIL_PREFIX = "Debug: ";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface FlashCallbacks {
  onLog: (line: string) => void;
  /** esptool's detailed log, kept apart so that it is only shown when connecting fails. */
  onDetail: (line: string) => void;
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

/** True when the chip never answered, as opposed to answering with something unsuitable. */
export function isConnectFailure(error: unknown): boolean {
  return error instanceof Error && /Failed to connect/.test(error.message);
}

/**
 * Runs `attempt` until it succeeds, retrying only when the chip never answered.
 * Any other error, such as an unsupported chip, stops at once.
 */
export async function retryConnect<T>(attempt: (count: number) => Promise<T>, tries: number, pauseMs = PAUSE_BEFORE_TRY_MS): Promise<T> {
  for (let count = 1; ; count++) {
    await sleep(pauseMs);
    try {
      return await attempt(count);
    } catch (error) {
      if (!isConnectFailure(error) || count >= tries) throw error;
    }
  }
}

export async function verifySha256(data: Uint8Array, expected: string): Promise<boolean> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", data as BufferSource));
  const hex = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return hex === expected;
}

async function loadFirmware(chip: Chip): Promise<Uint8Array> {
  const response = await fetch(chip.firmware.url);
  if (!response.ok) throw new Error(t("無法下載韌體（HTTP {status}）", { status: response.status }));
  const data = new Uint8Array(await response.arrayBuffer());
  if (!(await verifySha256(data, chip.firmware.sha256))) {
    throw new Error(t("韌體檔案驗證失敗，請重新整理網頁再試一次"));
  }
  return data;
}

/**
 * Erases the board and installs the MicroPython build for its chip.
 * The port must be closed; it is closed again on return.
 */
export async function installFirmware(port: SerialPort, callbacks: FlashCallbacks): Promise<Chip> {
  const { ESPLoader, Transport } = await import("esptool-js");
  class ShortTryLoader extends ESPLoader {
    override detectChip(mode?: Parameters<InstanceType<typeof ESPLoader>["detectChip"]>[0]): Promise<void> {
      return super.detectChip(mode, RESETS_PER_TRY);
    }
  }
  const tries = port.getInfo().usbVendorId === ESPRESSIF_VENDOR_ID ? NATIVE_USB_CONNECT_TRIES : CONNECT_TRIES;

  // Only connecting is retried, and nothing has been erased by then. Each try reopens the port.
  const { transport, loader } = await retryConnect(async (count) => {
    callbacks.onStage(count === 1 ? t("正在連接開發板（連不上時請按住 IO0 鍵）") : t("正在重新連接開發板（第 {count} 次）", { count }));
    const transport = new Transport(port, false);
    const loader = new ShortTryLoader({
      transport,
      baudrate: FLASH_BAUD,
      romBaudrate: ROM_BAUD,
      debugLogging: true,
      terminal: {
        clean: () => {},
        write: () => {},
        writeLine: (line) => {
          if (line.startsWith(DETAIL_PREFIX)) callbacks.onDetail(line.slice(DETAIL_PREFIX.length));
          else callbacks.onLog(line);
        },
      },
    });
    try {
      await loader.main();
      return { transport, loader };
    } catch (error) {
      await transport.disconnect().catch(() => {});
      throw error;
    }
  }, tries);

  try {
    // Refuse before erasing anything: a board without a matching firmware must stay untouched.
    const chip = chipFromName(loader.chip.CHIP_NAME);
    if (!chip) {
      throw new Error(t("這塊板子是 {chip}，目前只支援 ESP32、ESP32-S2、S3 和 C3", { chip: loader.chip.CHIP_NAME }));
    }
    const flashSize = await loader.detectFlashSize();
    if (isFlashTooSmall(flashSize)) {
      throw new Error(t("快閃記憶體只有 {size}，至少需要 {min}MB", { size: flashSize ?? "", min: MIN_FLASH_MB }));
    }

    callbacks.onStage(t("正在下載 {chip} 的韌體", { chip: chip.label }));
    const firmware = await loadFirmware(chip);

    callbacks.onStage(t("正在清除快閃記憶體"));
    await loader.eraseFlash();

    callbacks.onStage(t("正在寫入韌體"));
    await loader.writeFlash({
      fileArray: [{ data: firmware, address: chip.firmware.address }],
      flashMode: "keep",
      flashFreq: "keep",
      flashSize: "keep",
      eraseAll: false,
      compress: true,
      reportProgress: (_file, written, total) => callbacks.onProgress(written / total),
    });

    callbacks.onStage(t("正在重新啟動"));
    await loader.after("hard_reset");
    return chip;
  } finally {
    await transport.disconnect().catch(() => {});
  }
}
