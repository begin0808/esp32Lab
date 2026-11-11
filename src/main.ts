import { basicSetup, EditorView } from "codemirror";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { python } from "@codemirror/lang-python";
import { tags } from "@lezer/highlight";
import { CommandHistory, enterAction, nextIndent, parseCompletion } from "./command";
import { adaptExamplePins, chipFromMachine, CHIPS, FIRMWARE_VERSION, isChipId, type ChipId } from "./chips";
import { FileManager } from "./filemanager";
import { installFirmware, isConnectFailure } from "./flasher";
import { lang, setupLanguagePicker, t, translatePage } from "./i18n";
import { DataLog, LineBuffer, parseDataLine } from "./plot";
import { Plotter } from "./plotter";
import { RawRunWatcher } from "./rawrun";
import { pasteModeBytes, RawRepl, ReplExecError, ReplTimeoutError } from "./repl";
import { SerialLink } from "./serial";
import { setupStats } from "./stats";
import { setupStylePicker } from "./theme";
import {
  arduinoConvertPrompt,
  describeLines,
  explainPrompt,
  findDeviceIp,
  fillExample,
  findLastTraceback,
  fixErrorPrompt,
  geminiPrompt,
  looksLikeArduino,
  randomChannel,
  selectedLineRange,
  stripTerminalCodes,
} from "./text";

translatePage();

const exampleFiles = import.meta.glob<string>("./examples/**/*.py", { query: "?raw", import: "default", eager: true });

function example(file: string): string {
  return exampleFiles[`./examples/${lang === "en" ? "en/" : ""}${file}.py`];
}

const EXAMPLE_GROUPS = [
  {
    label: t("基礎輸出與輸入"),
    examples: [
      { name: t("LED 閃爍"), code: example("blink") },
      { name: t("按鈕開關 LED"), code: example("button_led") },
      { name: t("呼吸燈（PWM）"), code: example("breathing_led") },
      { name: t("可變電阻調亮度"), code: example("knob_led") },
      { name: t("無源蜂鳴器播放小星星"), code: example("buzzer_song") },
      { name: t("SG90 伺服馬達來回轉動"), code: example("servo_sweep") },
    ],
  },
  {
    label: t("感測器"),
    examples: [
      { name: t("光敏電阻自動夜燈"), code: example("light_sensor") },
      { name: t("人體紅外線警報（HC-SR501）"), code: example("pir_alarm") },
      { name: t("超音波測距（HC-SR04）"), code: example("ultrasonic") },
      { name: t("DHT11 溫濕度（監控窗）"), code: example("dht11_serial") },
      { name: t("DS18B20 溫度計"), code: example("ds18b20") },
    ],
  },
  {
    label: t("顯示與燈光"),
    examples: [
      { name: t("WS2812 全彩 LED 彩虹"), code: example("ws2812_rainbow") },
      { name: t("SSD1306 OLED 顯示器"), code: example("oled_ssd1306") },
      { name: t("I2C LCD 1602 顯示器"), code: example("lcd1602_i2c") },
      { name: t("MAX7219 點矩陣"), code: example("max7219_matrix") },
    ],
  },
  {
    label: t("Wi-Fi 與語音"),
    examples: [
      { name: t("手機控制 LED（同一個 Wi-Fi）"), code: example("web_led") },
      { name: t("語音控制 LED（MQTT）"), code: example("mqtt_led") },
      { name: t("DHT11 溫濕度警報"), code: example("dht11_alarm") },
      { name: t("Telegram 機器人控制 LED"), code: example("telegram_led") },
      { name: t("DHT11 資料存到 Google 試算表"), code: example("sheets_dht11") },
    ],
  },
  {
    label: t("進階技巧"),
    examples: [
      { name: t("I2C 掃描（找出裝置位址）"), code: example("i2c_scan") },
      { name: t("按鈕中斷（IRQ）"), code: example("button_irq") },
      { name: t("計時器讓 LED 自己閃（Timer）"), code: example("timer_blink") },
      { name: t("深度睡眠定時醒來"), code: example("deep_sleep") },
      { name: t("ESP-NOW 多塊板子互傳"), code: example("espnow_led") },
      { name: t("asyncio 同時做三件事"), code: example("asyncio_tasks") },
    ],
  },
];
const EXAMPLES = EXAMPLE_GROUPS.flatMap((group) => group.examples);

/** The same number means the same topic on both editions, so teachers can refer to an example by number. */
function numberedName(item: (typeof EXAMPLES)[number]): string {
  return `${EXAMPLES.indexOf(item) + 1}. ${item.name}`;
}

const STORAGE_KEY = "esp32-mp-code";
const CHIP_KEY = "esp32-mp-chip";
const MONITOR_LIMIT = 200_000;
// Output is drawn in batches, so a program printing as fast as it can does not freeze the page.
const MONITOR_FLUSH_MS = 50;
// Long runs of output are split across several text nodes, so adding to the end never copies a huge string.
const MONITOR_NODE_CHARS = 4096;
const FONT_SIZE_KEY = "esp32-mp-font-size";
const FONT_SIZE_DEFAULT = 14;
const FONT_SIZE_MIN = 12;
const FONT_SIZE_MAX = 32;
const FONT_SIZE_STEP = 2;
const EDITOR_WIDTH_KEY = "esp32-mp-editor-width";
const EDITOR_WIDTH_DEFAULT = 60;
const EDITOR_WIDTH_MIN = 20;
const EDITOR_WIDTH_MAX = 80;
const EDITOR_WIDTH_STEP = 2;
const PASTE_CHUNK = 128;
const PASTE_CHUNK_GAP = 20;
const COMPLETION_QUIET = 80;
const COMPLETION_TIMEOUT = 400;
const REPL_MAX_ROWS = 8;
// Enough to see how the chip started after the last few resets.
const CONNECT_LOG_LINES = 60;
const RESET_WAIT_MS = 1500;

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

const ui = {
  status: el("status"),
  connect: el<HTMLButtonElement>("connect"),
  install: el<HTMLButtonElement>("install"),
  upload: el<HTMLButtonElement>("upload"),
  run: el<HTMLButtonElement>("run"),
  stop: el<HTMLButtonElement>("stop"),
  reset: el<HTMLButtonElement>("reset"),
  clear: el<HTMLButtonElement>("clear"),
  unsupported: el("unsupported"),
  arduinoWarning: el("arduino-warning"),
  copyConvert: el<HTMLButtonElement>("copy-convert"),
  progressWrap: el("progress-wrap"),
  progressLabel: el("progress-label"),
  progress: el<HTMLProgressElement>("progress"),
  examples: el<HTMLSelectElement>("examples"),
  chip: el<HTMLSelectElement>("chip"),
  geminiButton: el<HTMLButtonElement>("gemini-button"),
  geminiLabel: el("gemini-label"),
  geminiMenu: el("gemini-menu"),
  copyPrompt: el<HTMLButtonElement>("copy-prompt"),
  copyExplain: el<HTMLButtonElement>("copy-explain"),
  explainTitle: el("explain-title"),
  explainNote: el("explain-note"),
  openFile: el<HTMLButtonElement>("open-file"),
  saveFile: el<HTMLButtonElement>("save-file"),
  boardFiles: el<HTMLButtonElement>("board-files"),
  fileInput: el<HTMLInputElement>("file-input"),
  monitor: el("monitor"),
  ipCard: el("ip-card"),
  ipLink: el<HTMLAnchorElement>("ip-link"),
  copyIp: el<HTMLButtonElement>("copy-ip"),
  errorCard: el("error-card"),
  copyError: el<HTMLButtonElement>("copy-error"),
  replForm: el<HTMLFormElement>("repl-form"),
  replInput: el<HTMLTextAreaElement>("repl-input"),
  replChoices: el("repl-choices"),
  replSend: el<HTMLButtonElement>("repl-send"),
  installDialog: el<HTMLDialogElement>("install-dialog"),
  firmwareVersion: el("firmware-version"),
  fontDown: el<HTMLButtonElement>("font-down"),
  fontUp: el<HTMLButtonElement>("font-up"),
  fontValue: el<HTMLOutputElement>("font-value"),
  workspace: el("workspace"),
  splitter: el("splitter"),
  language: el<HTMLSelectElement>("language-picker"),
  viewText: el<HTMLButtonElement>("view-text"),
  viewPlot: el<HTMLButtonElement>("view-plot"),
};

const link = new SerialLink();
const decoder = new TextDecoder();
let busy = false;
let hasFirmware = false;
/** The board's recent output, searched for addresses and errors. */
let monitorText = "";
let scanFrom = 0;
/** Board output received but not yet added to monitorText. */
let pendingBoardText = "";
/** Counts every character the board has sent, including any not drawn yet. */
let receivedChars = 0;
let promptTail = "";
let atPrompt = false;
/** Text waiting to be drawn; neighbouring pieces of the same kind are merged. */
let monitorQueue: { text: string; className?: string }[] = [];
let queuedChars = 0;
/** Characters currently drawn in the monitor, kept here because counting the page's text is slow. */
let monitorChars = 0;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let completing = false;
/** Set while a program sent by "Run (no save)" is running, so the end of its output can be noticed. */
let rawRun: RawRunWatcher | null = null;
let shownVariablesTip = false;
const commandHistory = new CommandHistory();
/** Every number the board printed in a form the chart understands, kept even while the text view is shown. */
const dataLog = new DataLog();
const dataLines = new LineBuffer();
const plotter = new Plotter(dataLog, {
  view: el("plot-view"),
  canvas: el<HTMLCanvasElement>("plot-canvas"),
  empty: el("plot-empty"),
  legend: el("plot-legend"),
  note: el("plot-note"),
  pause: el<HTMLButtonElement>("plot-pause"),
  windowPicker: el<HTMLSelectElement>("plot-window"),
  exportButton: el<HTMLButtonElement>("plot-export"),
});
const unnamedSeries = (position: number) => t("數值{position}", { position });
const fileManager = new FileManager(
  {
    dialog: el<HTMLDialogElement>("files-dialog"),
    space: el("files-space"),
    path: el("files-path"),
    list: el("files-list"),
    status: el("files-status"),
    upload: el<HTMLButtonElement>("files-upload"),
    saveEditor: el<HTMLButtonElement>("files-save-editor"),
    close: el<HTMLButtonElement>("files-close"),
    input: el<HTMLInputElement>("files-input"),
  },
  {
    getCode: () => getCode(),
    openInEditor: (text, path) => {
      setCode(text);
      if (path !== "/main.py") {
        systemMessage(t("已把 {path} 開到編輯器。注意：「上傳並執行」會存成 main.py；要存回原來的檔案，請到「板上檔案」按「把編輯器內容存成…」。", { path }));
      }
    },
    describeError: (error) => failureMessage(error),
  },
);

function readSaved(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function save(code: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // The editor still works when the browser blocks storage.
  }
}

// Colours come from the page's style, so the code follows whichever style is chosen.
const codeHighlight = HighlightStyle.define([
  { tag: tags.comment, color: "var(--code-comment)" },
  { tag: [tags.keyword, tags.bool, tags.null], color: "var(--code-keyword)" },
  { tag: [tags.string, tags.special(tags.string)], color: "var(--code-string)" },
  { tag: tags.number, color: "var(--code-number)" },
]);

const editor = new EditorView({
  doc: readSaved() ?? example("blink"),
  extensions: [
    basicSetup,
    python(),
    syntaxHighlighting(codeHighlight),
    // Large fonts are common here, and sideways scrolling makes code hard to follow.
    EditorView.lineWrapping,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) onCodeChanged();
    }),
  ],
  parent: el("editor"),
});

function readFontSize(): number {
  try {
    const saved = Number(localStorage.getItem(FONT_SIZE_KEY));
    if (saved >= FONT_SIZE_MIN && saved <= FONT_SIZE_MAX) return saved;
  } catch {
    // Fall through to the default when the browser blocks storage.
  }
  return FONT_SIZE_DEFAULT;
}

function readFontSizeShown(): number {
  return Number(ui.fontValue.textContent);
}

function setFontSize(size: number): void {
  document.documentElement.style.setProperty("--code-font-size", `${size}px`);
  ui.fontValue.textContent = String(size);
  ui.fontDown.disabled = size <= FONT_SIZE_MIN;
  ui.fontUp.disabled = size >= FONT_SIZE_MAX;
  editor.requestMeasure();
  try {
    localStorage.setItem(FONT_SIZE_KEY, String(size));
  } catch {
    // The chosen size still applies until the page is closed.
  }
}

function readEditorWidth(): number {
  try {
    const saved = Number(localStorage.getItem(EDITOR_WIDTH_KEY));
    if (saved >= EDITOR_WIDTH_MIN && saved <= EDITOR_WIDTH_MAX) return saved;
  } catch {
    // Fall through to the default when the browser blocks storage.
  }
  return EDITOR_WIDTH_DEFAULT;
}

function setEditorWidth(percent: number): void {
  const width = Math.min(EDITOR_WIDTH_MAX, Math.max(EDITOR_WIDTH_MIN, percent));
  document.documentElement.style.setProperty("--editor-width", `${width}%`);
  ui.splitter.setAttribute("aria-valuenow", String(Math.round(width)));
  try {
    localStorage.setItem(EDITOR_WIDTH_KEY, String(width));
  } catch {
    // The chosen width still applies until the page is closed.
  }
}

function dragSplitter(clientX: number): void {
  const style = getComputedStyle(ui.workspace);
  const paddingLeft = parseFloat(style.paddingLeft);
  const contentWidth = ui.workspace.clientWidth - paddingLeft - parseFloat(style.paddingRight);
  const left = ui.workspace.getBoundingClientRect().left + paddingLeft;
  setEditorWidth(((clientX - left) / contentWidth) * 100);
}

function getCode(): string {
  return editor.state.doc.toString();
}

function setCode(code: string): void {
  editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: code } });
}

function onCodeChanged(): void {
  const code = getCode();
  save(code);
  ui.arduinoWarning.hidden = !looksLikeArduino(code);
}

function readChip(): ChipId {
  try {
    const saved = localStorage.getItem(CHIP_KEY);
    if (isChipId(saved)) return saved;
  } catch {
    // Fall through to the default when the browser blocks storage.
  }
  return "esp32";
}

function selectedChip() {
  return CHIPS[ui.chip.value as ChipId];
}

function setChip(id: ChipId): void {
  ui.chip.value = id;
  try {
    localStorage.setItem(CHIP_KEY, id);
  } catch {
    // The choice still applies until the page is closed.
  }
}

/** The board's own answer overrides the menu, because examples need the pins of the real chip. */
function followDetectedChip(id: ChipId): void {
  if (id === ui.chip.value) return;
  setChip(id);
  systemMessage(t("偵測到 {chip}，之後選範例會使用這種晶片的腳位。編輯器裡現有的程式不會自動修改。", { chip: CHIPS[id].label }));
}

function setStatus(text: string, state: "idle" | "ready" | "busy" | "error"): void {
  ui.status.textContent = text;
  ui.status.dataset.state = state;
}

function refreshButtons(): void {
  const open = link.isOpen;
  ui.connect.disabled = busy || !SerialLink.isSupported();
  ui.connect.textContent = open ? t("中斷連線") : t("連接開發板");
  ui.install.disabled = busy || !link.selectedPort;
  ui.install.textContent = hasFirmware ? t("重新安裝韌體") : t("安裝韌體");
  ui.install.classList.toggle("primary", !!link.selectedPort && !hasFirmware);
  ui.upload.disabled = busy || !open || !hasFirmware;
  ui.run.disabled = busy || !open || !hasFirmware;
  ui.boardFiles.disabled = busy || !open || !hasFirmware;
  ui.stop.disabled = busy || !open;
  ui.reset.disabled = busy || !open;
  ui.replInput.disabled = busy || !open;
  ui.replSend.disabled = busy || !open;
  ui.language.disabled = busy;
  ui.replInput.placeholder = open && hasFirmware && !busy && !atPrompt ? t("程式執行中，按「停止」後可輸入指令") : t("輸入 MicroPython 指令後按 Enter");
}

function setBusy(value: boolean): void {
  busy = value;
  refreshButtons();
}

function showProgress(label: string, fraction: number | null): void {
  ui.progressWrap.hidden = false;
  ui.progressLabel.textContent = label;
  if (fraction === null) ui.progress.removeAttribute("value");
  else ui.progress.value = fraction * 100;
}

function hideProgress(): void {
  ui.progressWrap.hidden = true;
}

function appendMonitor(text: string, className?: string): void {
  if (!text) return;
  const last = monitorQueue.at(-1);
  if (last && last.className === className) last.text += text;
  else monitorQueue.push({ text, className });
  queuedChars += text.length;
  // A hidden tab may draw rarely, and text older than the monitor keeps would never be shown anyway.
  while (queuedChars > MONITOR_LIMIT) {
    const first = monitorQueue[0];
    const excess = queuedChars - MONITOR_LIMIT;
    if (first.text.length <= excess) {
      monitorQueue.shift();
      queuedChars -= first.text.length;
    } else {
      first.text = first.text.slice(excess);
      queuedChars -= excess;
    }
  }
  flushTimer ??= setTimeout(flushMonitor, MONITOR_FLUSH_MS);
}

/** Draws the waiting text, then checks the new output for an address or an error. */
function flushMonitor(): void {
  if (flushTimer !== null) clearTimeout(flushTimer);
  flushTimer = null;
  if (pendingBoardText) {
    const combined = monitorText + pendingBoardText;
    const dropped = Math.max(0, combined.length - MONITOR_LIMIT);
    monitorText = combined.slice(dropped);
    // Text dropped from the front moves everything else, so the scan position moves with it.
    scanFrom = Math.max(0, scanFrom - dropped);
    pendingBoardText = "";
    scanOutput();
  }
  drawQueue();
}

function drawQueue(): void {
  if (monitorQueue.length === 0) return;
  const pieces = monitorQueue;
  monitorQueue = [];
  queuedChars = 0;
  const box = ui.monitor;
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
  for (const { text, className } of pieces) {
    if (className) {
      const span = document.createElement("span");
      span.className = className;
      span.textContent = text;
      box.append(span);
    } else if (box.lastChild instanceof Text && box.lastChild.length < MONITOR_NODE_CHARS) {
      box.lastChild.appendData(text);
    } else {
      box.append(text);
    }
    monitorChars += text.length;
  }
  if (monitorChars > MONITOR_LIMIT) trimMonitor(monitorChars - MONITOR_LIMIT / 2);
  if (atBottom) box.scrollTop = box.scrollHeight;
}

/** Removes the oldest text, keeping the colour of the system messages that remain. */
function trimMonitor(excess: number): void {
  const box = ui.monitor;
  while (excess > 0 && box.firstChild) {
    const node = box.firstChild;
    const length = node.textContent?.length ?? 0;
    if (length <= excess) {
      node.remove();
      excess -= length;
      monitorChars -= length;
    } else {
      const text = node instanceof Text ? node : (node.firstChild as Text);
      text.deleteData(0, excess);
      monitorChars -= excess;
      excess = 0;
    }
  }
}

function systemMessage(text: string): void {
  appendMonitor(`\n${t("[系統]")} ${text}\n`, "system");
}

function clearMonitor(): void {
  if (flushTimer !== null) clearTimeout(flushTimer);
  flushTimer = null;
  monitorQueue = [];
  queuedChars = 0;
  ui.monitor.textContent = "";
  monitorChars = 0;
  monitorText = "";
  pendingBoardText = "";
  scanFrom = 0;
  ui.ipCard.hidden = true;
  ui.errorCard.hidden = true;
}

function onBoardOutput(data: Uint8Array): void {
  const decoded = decoder.decode(data, { stream: true });
  if (!rawRun) {
    showBoardText(decoded);
    return;
  }
  const followed = rawRun.push(decoded);
  if (followed.restarted) {
    // Deep sleep, machine.reset() or a crash: the board now runs its own main.py, which is ordinary output.
    // The note goes below the boot report's line, which says why the board restarted.
    rawRun = null;
    showBoardText(followed.text);
    systemMessage(t("開發板重新開機了，「執行（不存檔）」的程式已經不在記憶體裡，現在執行的是板子上的 main.py。"));
    setStatus(t("程式執行中"), "ready");
    showBoardText(followed.after ?? "");
    return;
  }
  showBoardText(followed.text);
  // After the program's last words, so the note that follows stays below them.
  if (followed.finished) finishRun();
}

function showBoardText(decoded: string): void {
  const text = stripTerminalCodes(decoded);
  if (!text) return;
  receivedChars += text.length;
  appendMonitor(text);
  recordData(text);
  pendingBoardText += text;
  if (pendingBoardText.length > MONITOR_LIMIT) pendingBoardText = pendingBoardText.slice(-MONITOR_LIMIT);
  // Only the last few characters decide whether the board is waiting at its prompt.
  promptTail = (promptTail + text).slice(-5);
  const wasAtPrompt = atPrompt;
  atPrompt = /(?:^|\n)>>> $/.test(promptTail);
  if (atPrompt !== wasAtPrompt) refreshButtons();
}

function recordData(text: string): void {
  const now = performance.now();
  let added = false;
  for (const line of dataLines.push(text)) {
    const samples = parseDataLine(line, unnamedSeries);
    if (samples && dataLog.add(now, samples)) added = true;
  }
  if (added) plotter.changed();
}

function showPlot(plot: boolean): void {
  ui.viewText.setAttribute("aria-pressed", String(!plot));
  ui.viewPlot.setAttribute("aria-pressed", String(plot));
  ui.monitor.hidden = plot;
  if (plot) {
    plotter.show();
  } else {
    plotter.hide();
    // A hidden monitor cannot scroll, so it returns to the newest output.
    flushMonitor();
    ui.monitor.scrollTop = ui.monitor.scrollHeight;
  }
}

function clearView(): void {
  if (!plotter.isShown) {
    clearMonitor();
    return;
  }
  if (dataLog.rowCount > 0 && !confirm(t("要清除圖表的所有資料嗎？還沒匯出的資料會不見。"))) return;
  dataLog.clear();
  plotter.cleared();
}

/** Only complete lines are scanned, so an address split across two reads is not misread. */
function scanOutput(): void {
  const lastNewline = monitorText.lastIndexOf("\n");
  if (lastNewline < scanFrom) return;
  const complete = monitorText.slice(scanFrom, lastNewline + 1);
  scanFrom = lastNewline + 1;

  if (ui.ipCard.hidden) {
    const ip = findDeviceIp(complete);
    if (ip) {
      ui.ipLink.textContent = `http://${ip}`;
      ui.ipLink.href = `http://${ip}`;
      ui.ipCard.hidden = false;
    }
  }
  if (findLastTraceback(monitorText)) ui.errorCard.hidden = false;
}

function failureMessage(error: unknown): string {
  if (error instanceof ReplExecError) return t("開發板回報錯誤：{message}", { message: error.message.trim() });
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Runs one REPL session, then gives the serial stream back to the monitor. */
async function withRepl<T>(action: (repl: RawRepl) => Promise<T>): Promise<T> {
  // A program started by "Run (no save)" is stopped here, and its raw REPL is reused.
  rawRun = null;
  const repl = new RawRepl(link);
  repl.attach();
  try {
    await enterRawRepl(repl);
    const result = await action(repl);
    await repl.exit();
    return result;
  } finally {
    link.setSink(onBoardOutput);
  }
}

/** A program that ignores Ctrl-C can still be interrupted right after a reset. */
async function enterRawRepl(repl: RawRepl): Promise<void> {
  try {
    await repl.enter(1500, 2);
  } catch (error) {
    if (!(error instanceof ReplTimeoutError)) throw error;
    await link.hardReset();
    await new Promise((resolve) => setTimeout(resolve, 600));
    await repl.enter(1500, 3);
  }
}

async function detectFirmware(): Promise<void> {
  setStatus(t("正在偵測 MicroPython"), "busy");
  try {
    const info = await withRepl((repl) => repl.readBoardInfo());
    hasFirmware = true;
    const flash = info.flashBytes ? t("，快閃記憶體 {size} MB", { size: Math.round(info.flashBytes / 1048576) }) : "";
    setStatus(t("已連接：{machine}{flash}，MicroPython {release}", { machine: info.machine, flash, release: info.release }), "ready");
    systemMessage(t("開發板就緒：{machine}{flash}，MicroPython {release}", { machine: info.machine, flash, release: info.release }));
    const chip = chipFromMachine(info.machine);
    if (chip) followDetectedChip(chip.id);
    // The board is waiting at its prompt, but that prompt went by while the site was reading its details.
    await link.write(Uint8Array.of(0x0d));
  } catch (error) {
    if (!(error instanceof ReplTimeoutError)) throw error;
    hasFirmware = false;
    setStatus(t("已連接，但沒有偵測到 MicroPython，請先安裝韌體"), "error");
    systemMessage(t("沒有偵測到 MicroPython。第一次使用，或之前燒錄過 Arduino 程式時，請按「安裝韌體」。"));
  }
}

async function connect(): Promise<void> {
  await link.requestPort();
  setBusy(true);
  try {
    link.setSink(onBoardOutput);
    await link.open();
    await detectFirmware();
  } catch (error) {
    await link.close();
    setStatus(t("連接失敗"), "error");
    systemMessage(t("連接失敗：{message}。如果其他程式（例如 Arduino IDE）正在使用序列埠，請先關閉。", { message: failureMessage(error) }));
  } finally {
    setBusy(false);
  }
}

async function disconnect(): Promise<void> {
  setBusy(true);
  rawRun = null;
  await link.close();
  hasFirmware = false;
  atPrompt = false;
  setStatus(t("尚未連接開發板"), "idle");
  setBusy(false);
}

/** `note` is shown first in the emptied monitor, so it stays above the program's output. */
async function restartBoard(note?: string): Promise<void> {
  clearMonitor();
  if (note) appendMonitor(`${t("[系統]")} ${note}
`, "system");
  // A line left unfinished before the reset, such as the prompt, must not swallow the program's first value.
  dataLines.reset();
  atPrompt = false;
  const wasRunning = rawRun !== null;
  rawRun = null;
  const before = receivedChars;
  await link.hardReset();
  // The chip reports its start within a few hundred milliseconds, so the buttons come back as soon as it does.
  // Boards without an auto-reset circuit print nothing, so after a while fall back to a soft reset.
  const deadline = Date.now() + RESET_WAIT_MS;
  while (receivedChars === before && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
  // From raw REPL a soft reset would skip main.py, so a program started by "Run (no save)" leaves raw REPL first.
  if (receivedChars === before) await link.write(wasRunning ? Uint8Array.of(0x03, 0x02, 0x04) : Uint8Array.of(0x03, 0x04));
}

async function upload(): Promise<void> {
  const code = getCode();
  if (looksLikeArduino(code) && !confirm(t("這段程式看起來是 Arduino C++，上傳後會出現語法錯誤。仍要上傳嗎？"))) return;

  setBusy(true);
  setStatus(t("正在上傳程式"), "busy");
  showProgress(t("正在上傳程式"), 0);
  const started = performance.now();
  const bytes = new TextEncoder().encode(code);
  try {
    await withRepl((repl) =>
      repl.writeFile("/main.py", bytes, (fraction) => {
        showProgress(t("正在上傳程式"), fraction);
      }),
    );
    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    setStatus(t("程式執行中"), "ready");
    await restartBoard(t("上傳完成：main.py，{size} KB，用了 {seconds} 秒", { size: Math.max(0.1, bytes.length / 1024).toFixed(1), seconds }));
  } catch (error) {
    setStatus(t("上傳失敗"), "error");
    systemMessage(t("上傳失敗：{message}", { message: failureMessage(error) }));
  } finally {
    hideProgress();
    setBusy(false);
  }
}

/**
 * Runs the editor's code from the board's memory without saving it, like mpremote's `run`: stop the program,
 * soft reset for a clean start, send the code, and show its output as it comes.
 */
async function runWithoutSaving(): Promise<void> {
  const code = getCode();
  if (looksLikeArduino(code) && !confirm(t("這段程式看起來是 Arduino C++，上傳後會出現語法錯誤。仍要上傳嗎？"))) return;

  setBusy(true);
  setStatus(t("正在送出程式"), "busy");
  rawRun = null;
  const repl = new RawRepl(link);
  repl.attach();
  try {
    await enterRawRepl(repl);
    await repl.softReset();
    clearMonitor();
    appendMonitor(`${t("[系統]")} ${t("執行（不存檔）：程式在板子的記憶體裡執行，沒有存成 main.py。重新啟動或拔掉電源後，板子會執行原本的 main.py。")}
`, "system");
    dataLines.reset();
    atPrompt = false;
    // An empty command would mean "soft reset" to the board instead of "run nothing".
    await repl.send(code.trim() ? code : "pass");
    rawRun = new RawRunWatcher();
    setStatus(t("程式執行中（未存檔）"), "ready");
  } catch (error) {
    rawRun = null;
    setStatus(t("執行失敗"), "error");
    systemMessage(t("執行失敗：{message}", { message: failureMessage(error) }));
    // Leave raw REPL, so the box below talks to the ordinary prompt again.
    await link.write(Uint8Array.of(0x03, 0x02)).catch(() => {});
  } finally {
    link.setSink(onBoardOutput);
    // The program's first output may have arrived together with the board's go-ahead.
    const unread = repl.takeUnread();
    if (unread.length) onBoardOutput(unread);
    setBusy(false);
  }
}

/** The program from "Run (no save)" ended or was stopped. Leaving raw REPL keeps its variables for the box below. */
function finishRun(): void {
  rawRun = null;
  setStatus(t("程式已停止"), "ready");
  link.write(Uint8Array.of(0x02)).catch(() => {});
  if (!shownVariablesTip) {
    shownVariablesTip = true;
    systemMessage(t("程式結束了，變數還留著：可以在下方輸入變數名稱，查看最後的值。"));
  }
}

async function stopProgram(): Promise<void> {
  await link.write(Uint8Array.of(0x03, 0x03));
  setStatus(t("程式已停止"), "ready");
}

/** Keeps the REPL open while the dialog is, then leaves the board stopped at its prompt. */
async function openBoardFiles(): Promise<void> {
  setBusy(true);
  setStatus(t("正在管理板上檔案"), "busy");
  fileManager.show();
  try {
    await withRepl((repl) => fileManager.use(repl));
  } catch (error) {
    fileManager.fail(t("無法讀取板上檔案：{message}", { message: failureMessage(error) }));
    await fileManager.closed();
  } finally {
    if (link.isOpen) {
      setStatus(t("程式已停止"), "ready");
      systemMessage(t("程式已停止。按「重新啟動」可以再執行 main.py。"));
      // The prompt went by while the dialog was using the board.
      await link.write(Uint8Array.of(0x0d)).catch(() => {});
    }
    setBusy(false);
  }
}

async function install(): Promise<void> {
  const port = link.selectedPort;
  if (!port) return;
  setBusy(true);
  const connectLog: string[] = [];
  try {
    await link.close();
    hasFirmware = false;
    systemMessage(t("開始安裝 {version}，會依晶片自動選擇韌體", { version: FIRMWARE_VERSION }));
    const chip = await installFirmware(port, {
      onLog: (line) => appendMonitor(`${line}\n`, "system"),
      onDetail: (line) => {
        connectLog.push(line);
        if (connectLog.length > CONNECT_LOG_LINES) connectLog.shift();
      },
      onStage: (label) => {
        setStatus(label, "busy");
        showProgress(label, null);
        // The status line changes quickly, so each step also stays in the monitor, showing how many tries it took.
        appendMonitor(`${t("[系統]")} ${label}\n`, "system");
      },
      onProgress: (fraction) => showProgress(t("正在寫入韌體"), fraction),
    });
    systemMessage(t("韌體安裝完成"));
    followDetectedChip(chip.id);
  } catch (error) {
    setStatus(t("韌體安裝失敗"), "error");
    systemMessage(
      link.isNativeUsb
        ? t("韌體安裝失敗：{message}。請按住 BOOT 鍵，按一下 RST 鍵，再放開 BOOT 鍵，然後重新按「連接開發板」並再裝一次。", { message: failureMessage(error) })
        : t("韌體安裝失敗：{message}。連不上時，請按住 IO0 鍵再重試。", { message: failureMessage(error) }),
    );
    if (isConnectFailure(error)) {
      appendMonitor(`\n${t("[連線紀錄：回報問題時請一起提供]")}\n${connectLog.join("\n")}\n\n`, "system");
    }
  } finally {
    hideProgress();
  }

  // Built-in USB disappears when the chip restarts, so the old port cannot be reopened.
  if (link.isNativeUsb) {
    setStatus(t("請按一下板子上的 RST 鍵，再按「連接開發板」"), "idle");
    systemMessage(t("請按一下板子上的 RST 鍵，等 2 秒，再按「連接開發板」並重新選擇序列埠。"));
    setBusy(false);
    return;
  }

  try {
    link.setSink(onBoardOutput);
    await link.open();
    // MicroPython creates its filesystem on the first boot after an erase.
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await detectFirmware();
  } catch (error) {
    systemMessage(t("無法重新連接開發板：{message}", { message: failureMessage(error) }));
  } finally {
    setBusy(false);
  }
}

async function copyText(text: string, button: HTMLElement): Promise<void> {
  const original = button.textContent;
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = t("已複製");
  } catch {
    button.textContent = t("複製失敗");
  }
  setTimeout(() => {
    button.textContent = original;
  }, 1500);
}

function guarded(action: () => Promise<void>): () => void {
  return () => {
    action().catch((error) => {
      // Closing the browser's port picker is not an error worth reporting.
      if (error instanceof DOMException && error.name === "NotFoundError") return;
      systemMessage(failureMessage(error));
    });
  };
}

link.onLost = () => {
  rawRun = null;
  hasFirmware = false;
  atPrompt = false;
  fileManager.close();
  setStatus(t("開發板連線中斷，請檢查 USB 線後重新連接"), "error");
  systemMessage(t("開發板連線中斷"));
  refreshButtons();
};

ui.connect.addEventListener("click", guarded(() => (link.isOpen ? disconnect() : connect())));
ui.upload.addEventListener("click", guarded(upload));
ui.run.addEventListener("click", guarded(runWithoutSaving));
// F5 runs the code, as in Thonny, but only while a board is connected; otherwise it still reloads the page.
window.addEventListener("keydown", (event) => {
  if (event.key !== "F5" || event.ctrlKey || event.shiftKey || event.altKey || event.metaKey) return;
  if (!link.isOpen || !hasFirmware) return;
  event.preventDefault();
  if (!ui.run.disabled && !document.querySelector("dialog[open]")) guarded(runWithoutSaving)();
});
ui.boardFiles.addEventListener("click", guarded(openBoardFiles));
ui.stop.addEventListener("click", guarded(stopProgram));
ui.reset.addEventListener("click", guarded(restartBoard));
ui.clear.addEventListener("click", clearView);
ui.viewText.addEventListener("click", () => showPlot(false));
ui.viewPlot.addEventListener("click", () => showPlot(true));

ui.install.addEventListener("click", () => {
  ui.installDialog.returnValue = "";
  ui.installDialog.showModal();
});
ui.installDialog.addEventListener("close", () => {
  if (ui.installDialog.returnValue === "confirm") guarded(install)();
});

function setReplText(text: string): void {
  ui.replInput.value = text;
  fitReplInput();
}

function fitReplInput(): void {
  ui.replInput.rows = Math.min(REPL_MAX_ROWS, ui.replInput.value.split("\n").length);
  ui.replChoices.hidden = true;
}

async function sendPaste(code: string): Promise<void> {
  const bytes = pasteModeBytes(code);
  // The board echoes as it reads, so a long block must not outrun its receive buffer.
  for (let offset = 0; offset < bytes.length; offset += PASTE_CHUNK) {
    await link.write(bytes.subarray(offset, offset + PASTE_CHUNK));
    await new Promise((resolve) => setTimeout(resolve, PASTE_CHUNK_GAP));
  }
}

/** Asks the board's own Tab completion, which knows what is imported, and keeps the exchange out of the monitor. */
async function askBoardToComplete(line: string): Promise<string> {
  const replyDecoder = new TextDecoder();
  let reply = "";
  const answered = new Promise<void>((resolve) => {
    let timer = setTimeout(resolve, COMPLETION_TIMEOUT);
    link.setSink((data) => {
      reply += replyDecoder.decode(data, { stream: true });
      clearTimeout(timer);
      timer = setTimeout(resolve, COMPLETION_QUIET);
    });
  });
  try {
    await link.write(new TextEncoder().encode(`${line}\t`));
    await answered;
    // Ctrl-C empties the board's copy of the line, because the text stays in this box until it is sent.
    link.setSink(() => {});
    await link.write(Uint8Array.of(0x03));
    await new Promise((resolve) => setTimeout(resolve, COMPLETION_QUIET));
  } finally {
    link.setSink(onBoardOutput);
  }
  return stripTerminalCodes(reply);
}

async function completeCommand(): Promise<void> {
  const value = ui.replInput.value;
  const lineStart = value.lastIndexOf("\n") + 1;
  const line = value.slice(lineStart).trimStart();
  const indent = value.slice(lineStart, value.length - line.length);
  completing = true;
  try {
    const completion = parseCompletion(line, await askBoardToComplete(line));
    if (ui.replInput.value !== value) return;
    setReplText(value.slice(0, lineStart) + indent + completion.line);
    ui.replChoices.textContent = completion.choices.join("  ");
    ui.replChoices.hidden = completion.choices.length === 0;
  } finally {
    completing = false;
  }
}

ui.replForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (completing) return;
  const command = ui.replInput.value.trimEnd();
  const isBlock = command.includes("\n");
  // Paste mode's control characters would reach a running program as ordinary input.
  if (isBlock && !atPrompt) {
    systemMessage(t("程式還在執行，請先按「停止」再送出多行程式。"));
    return;
  }
  commandHistory.add(command);
  setReplText("");
  guarded(() => (isBlock ? sendPaste(command) : link.write(new TextEncoder().encode(`${command.trim()}\r`))))();
});

ui.replInput.addEventListener("input", fitReplInput);
ui.replInput.addEventListener("keydown", (event) => {
  // Enter also confirms a word in a Chinese input method, and that must not run the command.
  if (event.isComposing) return;
  const input = ui.replInput;
  const caretAtEnd = input.selectionStart === input.value.length && input.selectionEnd === input.value.length;
  if (event.key === "Enter") {
    event.preventDefault();
    if (event.ctrlKey || (!event.shiftKey && enterAction(input.value) === "send" && (caretAtEnd || !input.value.includes("\n")))) {
      ui.replForm.requestSubmit();
    } else {
      input.setRangeText(`\n${caretAtEnd ? nextIndent(input.value) : ""}`, input.selectionStart, input.selectionEnd, "end");
      fitReplInput();
    }
  } else if (event.key === "ArrowUp" && !input.value.slice(0, input.selectionStart).includes("\n")) {
    const command = commandHistory.previous(input.value);
    if (command === null) return;
    event.preventDefault();
    setReplText(command);
  } else if (event.key === "ArrowDown" && !input.value.slice(input.selectionEnd).includes("\n")) {
    const command = commandHistory.next();
    if (command === null) return;
    event.preventDefault();
    setReplText(command);
    input.setSelectionRange(command.length, command.length);
  } else if (event.key === "Tab" && !event.shiftKey && atPrompt && !completing && caretAtEnd && input.value.trim() && /^[\x20-\x7e\n]*$/.test(input.value)) {
    // An empty box or a running program leaves Tab for moving between controls, so the keyboard is never stuck.
    event.preventDefault();
    guarded(completeCommand)();
  } else if (event.key === "c" && event.ctrlKey && input.selectionStart === input.selectionEnd) {
    event.preventDefault();
    setReplText("");
    guarded(stopProgram)();
  }
});

setupStats();

ui.examples.append(
  new Option(t("選擇範例…"), ""),
  ...EXAMPLE_GROUPS.map((group) => {
    const optgroup = document.createElement("optgroup");
    optgroup.label = group.label;
    optgroup.append(...group.examples.map((item) => new Option(numberedName(item), String(EXAMPLES.indexOf(item)))));
    return optgroup;
  }),
);
ui.examples.addEventListener("change", () => {
  const chosen = EXAMPLES[Number(ui.examples.value)];
  if (ui.examples.value !== "" && chosen && confirm(t("要用「{name}」取代目前的程式嗎？", { name: numberedName(chosen) }))) {
    const code = fillExample(chosen.code, randomChannel(), new URL("voice.html", location.href).href);
    setCode(adaptExamplePins(code, selectedChip()));
  }
  ui.examples.value = "";
});

ui.chip.append(...Object.values(CHIPS).map((chip) => new Option(chip.label, chip.id)));
ui.chip.value = readChip();
ui.chip.addEventListener("change", () => setChip(ui.chip.value as ChipId));

function selectedRange() {
  const { from, to } = editor.state.selection.main;
  return selectedLineRange(getCode(), from, to);
}

// The menu opens just below its button, and says whether it will explain a selection or the whole program.
ui.geminiMenu.addEventListener("beforetoggle", (event) => {
  if ((event as ToggleEvent).newState !== "open") return;
  const button = ui.geminiButton.getBoundingClientRect();
  const width = Math.min(320, window.innerWidth - 32);
  ui.geminiMenu.style.top = `${button.bottom + 6}px`;
  ui.geminiMenu.style.left = `${Math.max(16, Math.min(button.left, window.innerWidth - width - 16))}px`;
  const range = selectedRange();
  ui.explainTitle.textContent = range ? t("解說選取的程式（{lines}）", { lines: describeLines(range) }) : t("解說整份程式");
  ui.explainNote.textContent = range ? t("整份程式也會附上，讓 Gemini 了解前後文") : t("先在編輯器選取幾行，就只解說那幾行");
});
// Only a keyboard needs the focus moved into the menu; after a click it would look like a choice already made.
let geminiByPointer = false;
ui.geminiButton.addEventListener("pointerdown", () => {
  geminiByPointer = true;
});
ui.geminiButton.addEventListener("keydown", (event) => {
  geminiByPointer = false;
  if (event.key === "ArrowDown" && ui.geminiMenu.matches(":popover-open")) {
    event.preventDefault();
    ui.copyPrompt.focus();
  }
});
ui.geminiMenu.addEventListener("toggle", (event) => {
  if ((event as ToggleEvent).newState === "open" && !geminiByPointer) ui.copyPrompt.focus();
  geminiByPointer = false;
});
ui.geminiMenu.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  event.preventDefault();
  (document.activeElement === ui.copyPrompt ? ui.copyExplain : ui.copyPrompt).focus();
});

function copyFromMenu(text: string): void {
  ui.geminiMenu.hidePopover();
  ui.geminiButton.focus();
  void copyText(text, ui.geminiLabel);
}

ui.copyPrompt.addEventListener("click", () => copyFromMenu(geminiPrompt(selectedChip().promptLines)));
ui.copyExplain.addEventListener("click", () => copyFromMenu(explainPrompt(getCode(), selectedChip().promptLines, selectedRange())));
ui.copyConvert.addEventListener("click", () => void copyText(arduinoConvertPrompt(getCode()), ui.copyConvert));
ui.copyIp.addEventListener("click", () => void copyText(ui.ipLink.href, ui.copyIp));
ui.copyError.addEventListener("click", () => {
  flushMonitor();
  void copyText(fixErrorPrompt(getCode(), findLastTraceback(monitorText) ?? ""), ui.copyError);
});

ui.openFile.addEventListener("click", () => ui.fileInput.click());
ui.fileInput.addEventListener("change", async () => {
  const file = ui.fileInput.files?.[0];
  if (file) setCode(await file.text());
  ui.fileInput.value = "";
});
ui.saveFile.addEventListener("click", () => {
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(new Blob([getCode()], { type: "text/x-python" }));
  anchor.download = "main.py";
  anchor.click();
  URL.revokeObjectURL(anchor.href);
});

ui.fontDown.addEventListener("click", () => setFontSize(readFontSizeShown() - FONT_SIZE_STEP));
ui.fontUp.addEventListener("click", () => setFontSize(readFontSizeShown() + FONT_SIZE_STEP));

ui.splitter.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  ui.splitter.focus();
  ui.splitter.setPointerCapture(event.pointerId);
});
ui.splitter.addEventListener("pointermove", (event) => {
  if (ui.splitter.hasPointerCapture(event.pointerId)) dragSplitter(event.clientX);
});
ui.splitter.addEventListener("dblclick", () => setEditorWidth(EDITOR_WIDTH_DEFAULT));
ui.splitter.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  const step = event.key === "ArrowLeft" ? -EDITOR_WIDTH_STEP : EDITOR_WIDTH_STEP;
  setEditorWidth(Number(ui.splitter.getAttribute("aria-valuenow")) + step);
});

// The top bar wraps on narrow windows, so the panel opens just below wherever its button is.
el("settings-panel").addEventListener("beforetoggle", (event) => {
  if ((event as ToggleEvent).newState !== "open") return;
  const panel = el("settings-panel");
  panel.style.top = `${el("settings-button").getBoundingClientRect().bottom + 8}px`;
  panel.style.maxHeight = `calc(100vh - ${el("settings-button").getBoundingClientRect().bottom + 24}px)`;
});

setupStylePicker(el<HTMLSelectElement>("style-picker"));
setupLanguagePicker(ui.language, {
  allowSwitch: () => !link.isOpen || confirm(t("切換語言會重新載入頁面並中斷開發板連線，要繼續嗎？")),
  // A board connection cannot survive a reload, so this tab keeps its language until it is free.
  canFollow: () => !busy && !link.isOpen,
});
ui.firmwareVersion.textContent = t("{version}（依晶片自動選擇）", { version: FIRMWARE_VERSION });
setFontSize(readFontSize());
setEditorWidth(readEditorWidth());
ui.splitter.setAttribute("aria-valuemin", String(EDITOR_WIDTH_MIN));
ui.splitter.setAttribute("aria-valuemax", String(EDITOR_WIDTH_MAX));
ui.unsupported.hidden = SerialLink.isSupported();
onCodeChanged();
refreshButtons();
