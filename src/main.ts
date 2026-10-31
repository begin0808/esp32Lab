import { basicSetup, EditorView } from "codemirror";
import { python } from "@codemirror/lang-python";
import { FIRMWARE, installFirmware } from "./flasher";
import { RawRepl, ReplExecError, ReplTimeoutError } from "./repl";
import { SerialLink } from "./serial";
import {
  arduinoConvertPrompt,
  findDeviceIp,
  fillExample,
  findLastTraceback,
  fixErrorPrompt,
  GEMINI_PROMPT,
  looksLikeArduino,
  randomChannel,
  stripTerminalCodes,
} from "./text";
import blink from "./examples/blink.py?raw";
import webLed from "./examples/web_led.py?raw";
import mqttLed from "./examples/mqtt_led.py?raw";
import dht11Alarm from "./examples/dht11_alarm.py?raw";

const EXAMPLES = [
  { name: "LED 閃爍", code: blink },
  { name: "手機控制 LED（同一個 Wi-Fi）", code: webLed },
  { name: "語音控制 LED（MQTT）", code: mqttLed },
  { name: "DHT11 溫濕度警報", code: dht11Alarm },
];

const STORAGE_KEY = "esp32-mp-code";
const MONITOR_LIMIT = 200_000;
const FONT_SIZE_KEY = "esp32-mp-font-size";
const FONT_SIZE_DEFAULT = 16;
const FONT_SIZE_MIN = 12;
const FONT_SIZE_MAX = 32;
const FONT_SIZE_STEP = 2;
const EDITOR_WIDTH_KEY = "esp32-mp-editor-width";
const EDITOR_WIDTH_DEFAULT = 60;
const EDITOR_WIDTH_MIN = 20;
const EDITOR_WIDTH_MAX = 80;
const EDITOR_WIDTH_STEP = 2;

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

const ui = {
  status: el("status"),
  connect: el<HTMLButtonElement>("connect"),
  install: el<HTMLButtonElement>("install"),
  upload: el<HTMLButtonElement>("upload"),
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
  copyPrompt: el<HTMLButtonElement>("copy-prompt"),
  openFile: el<HTMLButtonElement>("open-file"),
  saveFile: el<HTMLButtonElement>("save-file"),
  fileInput: el<HTMLInputElement>("file-input"),
  monitor: el("monitor"),
  ipCard: el("ip-card"),
  ipLink: el<HTMLAnchorElement>("ip-link"),
  copyIp: el<HTMLButtonElement>("copy-ip"),
  errorCard: el("error-card"),
  copyError: el<HTMLButtonElement>("copy-error"),
  replForm: el<HTMLFormElement>("repl-form"),
  replInput: el<HTMLInputElement>("repl-input"),
  replSend: el<HTMLButtonElement>("repl-send"),
  installDialog: el<HTMLDialogElement>("install-dialog"),
  firmwareVersion: el("firmware-version"),
  fontDown: el<HTMLButtonElement>("font-down"),
  fontUp: el<HTMLButtonElement>("font-up"),
  fontValue: el<HTMLOutputElement>("font-value"),
  workspace: el("workspace"),
  splitter: el("splitter"),
};

const link = new SerialLink();
const decoder = new TextDecoder();
let busy = false;
let hasFirmware = false;
let monitorText = "";
let scanFrom = 0;

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

const editor = new EditorView({
  doc: readSaved() ?? blink,
  extensions: [
    basicSetup,
    python(),
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

function setStatus(text: string, state: "idle" | "ready" | "busy" | "error"): void {
  ui.status.textContent = text;
  ui.status.dataset.state = state;
}

function refreshButtons(): void {
  const open = link.isOpen;
  ui.connect.disabled = busy || !SerialLink.isSupported();
  ui.connect.textContent = open ? "中斷連線" : "連接開發板";
  ui.install.disabled = busy || !link.selectedPort;
  ui.install.textContent = hasFirmware ? "重新安裝韌體" : "安裝韌體";
  ui.install.classList.toggle("primary", !!link.selectedPort && !hasFirmware);
  ui.upload.disabled = busy || !open || !hasFirmware;
  ui.stop.disabled = busy || !open;
  ui.reset.disabled = busy || !open;
  ui.replInput.disabled = busy || !open;
  ui.replSend.disabled = busy || !open;
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
  const atBottom = ui.monitor.scrollHeight - ui.monitor.scrollTop - ui.monitor.clientHeight < 40;
  if (className) {
    const span = document.createElement("span");
    span.className = className;
    span.textContent = text;
    ui.monitor.append(span);
  } else {
    ui.monitor.append(text);
  }
  if (ui.monitor.textContent!.length > MONITOR_LIMIT) {
    ui.monitor.textContent = ui.monitor.textContent!.slice(-MONITOR_LIMIT / 2);
  }
  if (atBottom) ui.monitor.scrollTop = ui.monitor.scrollHeight;
}

function systemMessage(text: string): void {
  appendMonitor(`\n[系統] ${text}\n`, "system");
}

function clearMonitor(): void {
  ui.monitor.textContent = "";
  monitorText = "";
  scanFrom = 0;
  ui.ipCard.hidden = true;
  ui.errorCard.hidden = true;
}

function onBoardOutput(data: Uint8Array): void {
  const text = stripTerminalCodes(decoder.decode(data, { stream: true }));
  appendMonitor(text);
  monitorText = (monitorText + text).slice(-MONITOR_LIMIT);
  scanFrom = Math.min(scanFrom, monitorText.length);
  scanOutput();
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
  if (error instanceof ReplExecError) return `開發板回報錯誤：${error.message.trim()}`;
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Runs one REPL session, then gives the serial stream back to the monitor. */
async function withRepl<T>(action: (repl: RawRepl) => Promise<T>): Promise<T> {
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
  setStatus("正在偵測 MicroPython", "busy");
  try {
    const info = await withRepl((repl) => repl.readBoardInfo());
    hasFirmware = true;
    const flash = info.flashBytes ? `，快閃記憶體 ${Math.round(info.flashBytes / 1048576)} MB` : "";
    setStatus(`已連接：${info.machine}${flash}，MicroPython ${info.release}`, "ready");
    systemMessage(`開發板就緒：${info.machine}${flash}，MicroPython ${info.release}`);
  } catch (error) {
    if (!(error instanceof ReplTimeoutError)) throw error;
    hasFirmware = false;
    setStatus("已連接，但沒有偵測到 MicroPython，請先安裝韌體", "error");
    systemMessage("沒有偵測到 MicroPython。第一次使用，或之前燒錄過 Arduino 程式時，請按「安裝韌體」。");
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
    setStatus("連接失敗", "error");
    systemMessage(`連接失敗：${failureMessage(error)}。如果其他程式（例如 Arduino IDE）正在使用序列埠，請先關閉。`);
  } finally {
    setBusy(false);
  }
}

async function disconnect(): Promise<void> {
  setBusy(true);
  await link.close();
  hasFirmware = false;
  setStatus("尚未連接開發板", "idle");
  setBusy(false);
}

async function restartBoard(): Promise<void> {
  clearMonitor();
  const before = monitorText.length;
  await link.hardReset();
  // Boards without an auto-reset circuit print nothing, so fall back to a soft reset.
  await new Promise((resolve) => setTimeout(resolve, 1500));
  if (monitorText.length === before) await link.write(Uint8Array.of(0x03, 0x04));
}

async function upload(): Promise<void> {
  const code = getCode();
  if (looksLikeArduino(code) && !confirm("這段程式看起來是 Arduino C++，上傳後會出現語法錯誤。仍要上傳嗎？")) return;

  setBusy(true);
  setStatus("正在上傳程式", "busy");
  showProgress("正在上傳程式", 0);
  try {
    await withRepl((repl) =>
      repl.writeFile("/main.py", new TextEncoder().encode(code), (fraction) => {
        showProgress("正在上傳程式", fraction);
      }),
    );
    setStatus("程式執行中", "ready");
    await restartBoard();
  } catch (error) {
    setStatus("上傳失敗", "error");
    systemMessage(`上傳失敗：${failureMessage(error)}`);
  } finally {
    hideProgress();
    setBusy(false);
  }
}

async function stopProgram(): Promise<void> {
  await link.write(Uint8Array.of(0x03, 0x03));
  setStatus("程式已停止", "ready");
}

async function install(): Promise<void> {
  const port = link.selectedPort;
  if (!port) return;
  setBusy(true);
  try {
    await link.close();
    hasFirmware = false;
    systemMessage(`開始安裝 ${FIRMWARE.version}`);
    await installFirmware(port, {
      onLog: (line) => appendMonitor(`${line}\n`, "system"),
      onStage: (label) => {
        setStatus(label, "busy");
        showProgress(label, null);
      },
      onProgress: (fraction) => showProgress("正在寫入韌體", fraction),
    });
    systemMessage("韌體安裝完成");
  } catch (error) {
    setStatus("韌體安裝失敗", "error");
    systemMessage(`韌體安裝失敗：${failureMessage(error)}。連不上時，請按住 IO0 鍵再重試。`);
  } finally {
    hideProgress();
  }

  try {
    link.setSink(onBoardOutput);
    await link.open();
    // MicroPython creates its filesystem on the first boot after an erase.
    await new Promise((resolve) => setTimeout(resolve, 2500));
    await detectFirmware();
  } catch (error) {
    systemMessage(`無法重新連接開發板：${failureMessage(error)}`);
  } finally {
    setBusy(false);
  }
}

async function copyText(text: string, button: HTMLButtonElement): Promise<void> {
  const original = button.textContent;
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = "已複製";
  } catch {
    button.textContent = "複製失敗";
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
  hasFirmware = false;
  setStatus("開發板連線中斷，請檢查 USB 線後重新連接", "error");
  systemMessage("開發板連線中斷");
  refreshButtons();
};

ui.connect.addEventListener("click", guarded(() => (link.isOpen ? disconnect() : connect())));
ui.upload.addEventListener("click", guarded(upload));
ui.stop.addEventListener("click", guarded(stopProgram));
ui.reset.addEventListener("click", guarded(restartBoard));
ui.clear.addEventListener("click", clearMonitor);

ui.install.addEventListener("click", () => {
  ui.installDialog.returnValue = "";
  ui.installDialog.showModal();
});
ui.installDialog.addEventListener("close", () => {
  if (ui.installDialog.returnValue === "confirm") guarded(install)();
});

ui.replForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const command = ui.replInput.value;
  ui.replInput.value = "";
  guarded(() => link.write(new TextEncoder().encode(`${command}\r\n`)))();
});

ui.examples.append(new Option("選擇範例…", ""), ...EXAMPLES.map((example, index) => new Option(example.name, String(index))));
ui.examples.addEventListener("change", () => {
  const example = EXAMPLES[Number(ui.examples.value)];
  if (ui.examples.value !== "" && example && confirm(`要用「${example.name}」取代目前的程式嗎？`)) {
    setCode(fillExample(example.code, randomChannel(), new URL("voice.html", location.href).href));
  }
  ui.examples.value = "";
});

ui.copyPrompt.addEventListener("click", () => void copyText(GEMINI_PROMPT, ui.copyPrompt));
ui.copyConvert.addEventListener("click", () => void copyText(arduinoConvertPrompt(getCode()), ui.copyConvert));
ui.copyIp.addEventListener("click", () => void copyText(ui.ipLink.href, ui.copyIp));
ui.copyError.addEventListener("click", () => {
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

ui.firmwareVersion.textContent = FIRMWARE.version;
setFontSize(readFontSize());
setEditorWidth(readEditorWidth());
ui.splitter.setAttribute("aria-valuemin", String(EDITOR_WIDTH_MIN));
ui.splitter.setAttribute("aria-valuemax", String(EDITOR_WIDTH_MAX));
ui.unsupported.hidden = SerialLink.isSupported();
onCodeChanged();
refreshButtons();
