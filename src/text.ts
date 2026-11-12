import { lang } from "./i18n";

const ARDUINO_PATTERNS = [/^\s*#include\s*[<"]/m, /\bvoid\s+(setup|loop)\s*\(/, /\bSerial\.(begin|print)/, /\bpinMode\s*\(/];

export function looksLikeArduino(code: string): boolean {
  return ARDUINO_PATTERNS.some((pattern) => pattern.test(code));
}

/** Finds the first device address in monitor output, ignoring netmasks and unusable addresses. */
export function findDeviceIp(text: string): string | null {
  for (const match of text.matchAll(/\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/g)) {
    const octets = match.slice(1).map(Number);
    if (octets.some((octet) => octet > 255)) continue;
    if (octets[0] === 0 || octets[0] === 127 || octets[0] >= 224) continue;
    if (octets[3] === 0 || octets[3] === 255) continue;
    return match[0];
  }
  return null;
}

/** Returns the last Python traceback in the monitor output, or null when there is none. */
export function findLastTraceback(text: string): string | null {
  const start = text.lastIndexOf("Traceback (most recent call last):");
  if (start < 0) return null;
  const lines = text.slice(start).split(/\r?\n/);
  const end = lines.findIndex((line, index) => index > 0 && line.length > 0 && !line.startsWith(" "));
  // The last line may still be arriving, so "KeyboardInt" must not count as a real error.
  if (end < 0 || end === lines.length - 1) return null;
  const traceback = lines.slice(0, end + 1).join("\n");
  // Ctrl-C from the stop button also raises a traceback, which is not a bug.
  return /KeyboardInterrupt/.test(lines[end]) ? null : traceback;
}

export type LedCommand = "on" | "off" | "blink";

/** "Off" is checked before "on" so that a sentence containing both turns the LED off. Both languages always work. */
export function parseVoiceCommand(text: string): LedCommand | null {
  const english = text.toLowerCase();
  if (text.includes("閃") || /\b(blink|flash)/.test(english)) return "blink";
  if (text.includes("關") || text.includes("暗") || /\b(off|dark)\b/.test(english)) return "off";
  if (text.includes("開") || text.includes("亮") || /\b(on|bright)\b/.test(english)) return "on";
  return null;
}

/** MQTT treats "/", "+" and "#" specially, so a channel name must not contain them. */
export function isValidChannel(name: string): boolean {
  return /^[A-Za-z0-9_-]{1,32}$/.test(name);
}

export interface BrokerSettings {
  host: string;
  port: number;
  path: string;
  username?: string;
}

export const DEFAULT_BROKER: BrokerSettings = { host: "broker.emqx.io", port: 8084, path: "/mqtt" };

export function isValidBroker({ host, port, path }: BrokerSettings): boolean {
  return /^[A-Za-z0-9.-]+$/.test(host) && Number.isInteger(port) && port >= 1 && port <= 65535 && /^\/\S*$/.test(path);
}

/** An HTTPS page may only open encrypted WebSockets, so the scheme is not configurable. */
export function brokerUrl({ host, port, path }: BrokerSettings): string {
  return `wss://${host}:${port}${path}`;
}

export function commandTopic(channel: string): string {
  return `esp32-mp-class/${channel}/command`;
}

export function stateTopic(channel: string): string {
  return `esp32-mp-class/${channel}/state`;
}

export function randomChannel(prefix = "led"): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `${prefix}-${[...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

/** Each student gets a private channel, and the board can print where the control page is. */
export function fillExample(code: string, channel: string, voicePage: string): string {
  return code.replaceAll("{{CHANNEL}}", channel).replaceAll("{{VOICE_PAGE}}", voicePage);
}

export function stripTerminalCodes(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
}

export function geminiPrompt(boardLines: string): string {
  if (lang === "en") {
    return `Please write an ESP32 program in MicroPython, not Arduino C++.

Hardware and environment:
${boardLines}
- Wiring: (replace with your wiring, for example: LED on GPIO 18, DHT11 signal on GPIO 4)

Program requirements:
- Give me one complete main.py, not several files, and no packages that need separate installation
- Use the built-in dht module for sensors and the built-in asyncio for a web server
- Connect to Wi-Fi with network.WLAN(), put the credentials at the top of the program, and print the IP address once connected
- Use asyncio when the program has to do several things at once, not blocking time.sleep
- Write the comments in English

What I want the program to do:
(describe it here)`;
  }
  return `請用 MicroPython 幫我寫 ESP32 程式，不要用 Arduino C++。

硬體與環境：
${boardLines}
- 接線：（請改成你的接線，例如：外接 LED 接 GPIO 18、DHT11 訊號線接 GPIO 4）

程式要求：
- 只給我一份完整的 main.py，不要分成多個檔案，也不要用需要另外安裝的套件
- 感測器用內建的 dht 模組，網頁伺服器用內建的 asyncio
- 用 network.WLAN() 連 Wi-Fi，帳密寫在程式開頭，連線成功後用 print 印出 IP 位址
- 程式要同時做多件事時用 asyncio，不要用會卡住的 time.sleep
- 註解用繁體中文

我想做的功能：
（請在這裡描述你想做的功能）`;
}

const WIFI_PLACEHOLDER = "YOUR_WIFI_SETTING";

/** Prompts leave the student's computer, so Wi-Fi details, accounts, bot tokens and script addresses must not go with them. */
export function hideWifiSettings(code: string): string {
  const quoted = `"[^"\\n]*"|'[^'\\n]*'`;
  return code
    .replace(new RegExp(`(\\w*(?:ssid|pass(?:word|wd|phrase)?|pwd|psk|token|user)\\w*(?:\\[\\s*\\])?\\s*=\\s*)(?:${quoted})`, "gi"), `$1"${WIFI_PLACEHOLDER}"`)
    .replace(new RegExp(`(\\.(?:connect|begin)\\(\\s*)(?:${quoted})(\\s*,\\s*)(?:${quoted})`, "g"), `$1"${WIFI_PLACEHOLDER}"$2"${WIFI_PLACEHOLDER}"`)
    .replace(/https:\/\/script\.google(?:usercontent)?\.com\/[^"'\s]*/g, "YOUR_SCRIPT_URL");
}

export function arduinoConvertPrompt(code: string): string {
  if (lang === "en") {
    return `Please rewrite the Arduino C++ program below as MicroPython (v1.29.0) for the ESP32, keeping the same behaviour and pins.

Requirements:
- Give me one complete main.py, with no packages that need separate installation
- Use the built-in dht module for sensors and the built-in asyncio for a web server
- Print the IP address once connected
- Write the comments in English

Code:
${hideWifiSettings(code)}`;
  }
  return `請把下面的 Arduino C++ 程式改寫成 ESP32 用的 MicroPython（v1.29.0），功能和腳位都要保持一樣。

要求：
- 只給我一份完整的 main.py，不要用需要另外安裝的套件
- 感測器用內建的 dht 模組，網頁伺服器用內建的 asyncio
- 連線成功後用 print 印出 IP 位址
- 註解用繁體中文

程式碼：
${hideWifiSettings(code)}`;
}

export function fixErrorPrompt(code: string, traceback: string): string {
  if (lang === "en") {
    return `My ESP32 MicroPython (v1.29.0) program hit an error while running. Please find the cause and give me the complete corrected main.py.

Error message:
${traceback}

Code:
${hideWifiSettings(code)}`;
  }
  return `我的 ESP32 MicroPython（v1.29.0）程式執行時發生錯誤，請幫我找出原因並給我修正後的完整 main.py。

錯誤訊息：
${traceback}

程式碼：
${hideWifiSettings(code)}`;
}

export interface LineRange {
  from: number;
  to: number;
}

function lineCount(code: string): number {
  return code.replace(/\n+$/, "").split("\n").length;
}

/** The lines a selection covers, or null when nothing is selected or the selection takes in the whole program. */
export function selectedLineRange(code: string, from: number, to: number): LineRange | null {
  const start = Math.min(from, to);
  const end = Math.max(from, to);
  if (start === end) return null;
  const lineAt = (offset: number) => code.slice(0, offset).split("\n").length;
  const first = lineAt(start);
  let last = lineAt(end);
  // A selection dragged over whole lines ends at the start of the next one, which is not part of it.
  if (last > first && code[end - 1] === "\n") last--;
  if (first === 1 && last >= lineCount(code)) return null;
  return { from: first, to: last };
}

export function describeLines(range: LineRange): string {
  if (lang === "en") return range.from === range.to ? `line ${range.from}` : `lines ${range.from}–${range.to}`;
  return range.from === range.to ? `第 ${range.from} 行` : `第 ${range.from}–${range.to} 行`;
}

/** Gemini can only point to "line 8" if the lines carry the editor's numbers. */
export function numberLines(code: string): string {
  const lines = code.replace(/\n+$/, "").split("\n");
  const width = String(lines.length).length;
  return lines.map((line, index) => `${String(index + 1).padStart(width)} | ${line}`.trimEnd()).join("\n");
}

export function explainPrompt(code: string, boardLines: string, range: LineRange | null = null): string {
  const shown = hideWifiSettings(code);
  const hidden = shown !== code;
  const numbered = numberLines(shown);
  if (lang === "en") {
    const part = range ? describeLines(range) : "";
    return `I am new to MicroPython. Please explain ${range ? `${part} of ` : ""}the ESP32 program below (MicroPython v1.29.0).${range ? " The other lines are only there so you can see the context; you do not need to explain them." : ""}

Hardware:
${boardLines}

Please explain in this order, in plain English, explaining any technical term the first time it appears:
${
  range
    ? `1. In one sentence, what these lines do for the program as a whole
2. Which parts and pins these lines use (say so if they use none)
3. Section by section: give each section's line numbers (for example "lines 5–8"), what it does and why it is written that way
4. What the serial monitor shows when these lines run (say so if nothing)`
    : `1. In one sentence, what the program does
2. Which parts to connect, and to which pins (say so if the program uses none)
3. Section by section: give each section's line numbers (for example "lines 5–8"), what it does and why it is written that way
4. What the serial monitor will roughly show when it runs`
}

Please do not change or rewrite the program; only explain it. The number before each line is its line number, not part of the program.${hidden ? "\nYOUR_WIFI_SETTING and YOUR_SCRIPT_URL stand for settings I have hidden, such as a Wi-Fi password or a web address." : ""}

Code:
${numbered}`;
  }
  const part = range ? describeLines(range) : "";
  return `我是 MicroPython 初學者，請幫我解說下面這份 ESP32 程式（MicroPython v1.29.0）${range ? `的${part}。其他行只是讓你了解前後文，不用解說` : ""}。

硬體：
${boardLines}

請依照下面的順序說明，用簡單的繁體中文，遇到專有名詞先解釋：
${
  range
    ? `1. 一句話說明這幾行在整個程式裡負責什麼
2. 這幾行用到哪些零件、接在哪個腳位（沒有用到就說沒有）
3. 分段解說：每段標出行號（例如「第 5–8 行」），說明做什麼、為什麼這樣寫
4. 這幾行執行時，序列埠監控窗會看到什麼（沒有輸出就說沒有）`
    : `1. 一句話說明這個程式在做什麼
2. 要接哪些零件、接在哪個腳位（程式沒寫到就說沒有）
3. 分段解說：每段標出行號（例如「第 5–8 行」），說明做什麼、為什麼這樣寫
4. 執行後，序列埠監控窗大概會看到什麼`
}

請不要改寫或重寫程式，只要解說。每行前面的數字是行號，不是程式的一部分。${hidden ? "\n程式裡的 YOUR_WIFI_SETTING、YOUR_SCRIPT_URL 是我先隱藏起來的 Wi-Fi 密碼、帳號或網址。" : ""}

程式碼：
${numbered}`;
}
