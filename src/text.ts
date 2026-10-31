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

/** "關" is checked before "開" so that a sentence containing both turns the LED off. */
export function parseVoiceCommand(text: string): LedCommand | null {
  if (text.includes("閃")) return "blink";
  if (text.includes("關") || text.includes("暗")) return "off";
  if (text.includes("開") || text.includes("亮")) return "on";
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

export function randomChannel(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `led-${[...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
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

/** Prompts leave the student's computer, so Wi-Fi names and passwords must not go with them. */
export function hideWifiSettings(code: string): string {
  const quoted = `"[^"\\n]*"|'[^'\\n]*'`;
  return code
    .replace(new RegExp(`(\\w*(?:ssid|pass(?:word|wd|phrase)?|pwd|psk)\\w*(?:\\[\\s*\\])?\\s*=\\s*)(?:${quoted})`, "gi"), `$1"${WIFI_PLACEHOLDER}"`)
    .replace(new RegExp(`(\\.(?:connect|begin)\\(\\s*)(?:${quoted})(\\s*,\\s*)(?:${quoted})`, "g"), `$1"${WIFI_PLACEHOLDER}"$2"${WIFI_PLACEHOLDER}"`);
}

export function arduinoConvertPrompt(code: string): string {
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
  return `我的 ESP32 MicroPython（v1.29.0）程式執行時發生錯誤，請幫我找出原因並給我修正後的完整 main.py。

錯誤訊息：
${traceback}

程式碼：
${hideWifiSettings(code)}`;
}
