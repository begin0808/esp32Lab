import { usesDash } from "./dash";
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

/** Gemini has never seen dash.py, the site's own helper, so every prompt about a dashboard program carries its API. */
export function dashGuide(): string {
  if (lang === "en") {
    return `The phone dashboard helper dash (the ESP32 Lab site saves dash.py to the board's /lib by itself) is used like this:
import time
import dash
board = dash.Dashboard(TOPIC_NAME, SSID, PASSWORD)  # TOPIC_NAME may only use letters, digits, underscores and hyphens
(create the widgets here)
board.start()  # joins Wi-Fi and MQTT, and prints the dashboard's address
while True:
    board.check()  # must be called every time round the loop
    ...
    time.sleep_ms(20)

Widgets from the board to the phone (send with .set()):
- board.value("name", unit=""): a number or text
- board.gauge("name", min=0, max=100, unit="", color="green"): a half-circle gauge; color is green, red, yellow or blue
- board.chart("name", unit=""): a line chart; each .set() adds one point
- board.led("name", color="green"): a lamp, .set(True) or .set(False)
- board.text("name"): one line of text
- board.alert("name"): pops up an alert with a sound on the phone, sent with .send("message")
- board.log("name", ["column 1", "column 2"]): a table on the phone; .add(value 1, value 2) adds a row (one value per column) and the phone adds the time. The phone can download it as CSV; rows only arrive while the phone page is open
Widgets from the phone to the board:
- board.switch("name"): .value is True or False
- board.button("name"): .pressed() returns True once after each press
- board.slider("name", min=0, max=100, unit=""): .value is a whole number
- board.color("name"): .value is (red, green, blue), each 0-255
- board.pad("name"): a direction pad; .value is "up", "down", "left" or "right" while held, and "" when released
- board.select("name", ["option 1", "option 2"]): .value is the chosen text
- board.input("name"): .value is the text from the phone; .changed() returns True once when new text arrives
- board.number("name", value=None, min=0, max=100, step=1, unit=""): a number setting with - and + buttons; .value is the number (whole when min and step are whole); .changed() returns True once when the phone changes it. Good for limits that students adjust without changing the code
- board.joystick("name"): .x (left -100 to right 100) and .y (back -100 to forward 100); both go back to 0 when released
- board.tilt("name"): the phone's tilt, turned on with a button on the phone; .x and .y are -100 to 100 (flat is 0, 45 degrees is full), and .on says whether it is turned on
The board can also change a switch, slider, color, select, input or number with .set().
Direction pads, joysticks and tilt go back to rest by themselves when the phone stops sending for 1 s or drops off, so a car stops.
The phone page shows the board's Wi-Fi signal, running time and free memory by itself; no code is needed for that.

Rules:
- Never pause with time.sleep(1) or longer; the loop must keep running. Read sensors every so often with time.ticks_ms() and time.ticks_diff()
- Do not write your own Wi-Fi or MQTT code; dash does that and reconnects by itself
- A dashboard has at most 30 widgets. Each widget sends at most every 0.5 s, so there is no need to slow it down yourself
- Do not write dash.py itself, and do not use other dashboard packages`;
  }
  return `手機儀表板工具 dash（ESP32 Lab 網站會自動把 dash.py 存到板子的 /lib）的寫法如下：
import time
import dash
board = dash.Dashboard(TOPIC_NAME, SSID, PASSWORD)  # TOPIC_NAME 只能用英文、數字、底線和連字號
（在這裡建立元件）
board.start()  # 連上 Wi-Fi 和 MQTT，並印出手機儀表板的網址
while True:
    board.check()  # 迴圈裡每次都要呼叫
    ...
    time.sleep_ms(20)

板子 → 手機的元件（用 .set() 送出）：
- board.value("名稱", unit="")：數字或文字
- board.gauge("名稱", min=0, max=100, unit="", color="green")：半圓形儀表，color 可用 green、red、yellow、blue
- board.chart("名稱", unit="")：折線圖，每次 .set() 是一個點
- board.led("名稱", color="green")：指示燈，.set(True) 或 .set(False)
- board.text("名稱")：一行文字
- board.alert("名稱")：手機跳出提醒並發出聲音，用 .send("訊息") 送出
- board.log("名稱", ["欄位一", "欄位二"])：手機上的紀錄表，用 .add(值一, 值二) 新增一列（每欄一個值），時間由手機加上。手機可以下載 CSV；手機頁打開時才收得到
手機 → 板子的元件：
- board.switch("名稱")：.value 是 True 或 False
- board.button("名稱")：每按一次，.pressed() 回傳一次 True
- board.slider("名稱", min=0, max=100, unit="")：.value 是整數
- board.color("名稱")：.value 是 (紅, 綠, 藍)，各 0～255
- board.pad("名稱")：方向鍵，按住時 .value 是 "up"、"down"、"left"、"right"，放開時是 ""
- board.select("名稱", ["選項一", "選項二"])：.value 是選到的文字
- board.input("名稱")：.value 是手機傳來的文字，有新文字時 .changed() 回傳一次 True
- board.number("名稱", value=None, min=0, max=100, step=1, unit="")：有 − 和 ＋ 按鈕的數字設定，.value 是數字（min 和 step 都是整數時是整數），手機改了時 .changed() 回傳一次 True。適合讓學生不改程式就能調整門檻
- board.joystick("名稱")：搖桿，.x 是左右（左 -100～右 100），.y 是前後（後 -100～前 100），放開時都回到 0
- board.tilt("名稱")：手機傾斜，要在手機上按按鈕開啟；.x 和 .y 是 -100～100（平放是 0，傾斜 45 度是最大），.on 表示有沒有開啟
開關、滑桿、色彩、選單、文字輸入、數字設定也可以在板子上用 .set() 改。
方向鍵、搖桿和手機傾斜在手機超過 1 秒沒傳訊息或斷線時會自動回到靜止，車子會停下來。
手機頁會自動顯示板子的 Wi-Fi 訊號、已執行時間和剩餘記憶體，不用寫程式。

規則：
- 不要用 time.sleep(1) 這類一秒以上的暫停，迴圈要一直跑；感測器用 time.ticks_ms() 和 time.ticks_diff() 每隔一段時間讀一次
- 不要自己寫 Wi-Fi 或 MQTT 連線，dash 會處理，斷線也會自動重連
- 一個儀表板最多 30 個元件；同一個元件最快每 0.5 秒送一次，不用自己限速
- 不要寫 dash.py 本身，也不要用其他儀表板套件`;
}

export function dashboardPrompt(boardLines: string): string {
  if (lang === "en") {
    return `Please write an ESP32 program in MicroPython, not Arduino C++, that shows its readings and controls on a phone with the site's phone dashboard.

Hardware and environment:
${boardLines}
- Wiring: (replace with your wiring, for example: LED on GPIO 18, DHT11 signal on GPIO 4)

Program requirements:
- Give me one complete main.py, not several files
- Put SSID, PASSWORD and TOPIC_NAME at the top of the program
- Write the comments in English

${dashGuide()}

What I want to see and control on the phone:
(describe it here, for example: show the temperature on a gauge, and turn the fan on and off with a switch)`;
  }
  return `請用 MicroPython 幫我寫 ESP32 程式，不要用 Arduino C++，並用網站的手機儀表板在手機上顯示數值和控制開發板。

硬體與環境：
${boardLines}
- 接線：（請改成你的接線，例如：外接 LED 接 GPIO 18、DHT11 訊號線接 GPIO 4）

程式要求：
- 只給我一份完整的 main.py，不要分成多個檔案
- SSID、PASSWORD 和 TOPIC_NAME 寫在程式開頭
- 註解用繁體中文

${dashGuide()}

我想在手機上看到和控制的：
（請在這裡描述，例如：用儀表顯示溫度，用開關控制電風扇）`;
}

/** Explaining or fixing a dashboard program needs the same guide, or Gemini would guess what board.gauge() does. */
function withDashGuide(prompt: string, code: string): string {
  if (!usesDash(code)) return prompt;
  return `${prompt}

${lang === "en" ? "About dash in this program:" : "關於程式裡的 dash："}
${dashGuide()}`;
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
  return withDashGuide(basicFixErrorPrompt(code, traceback), code);
}

function basicFixErrorPrompt(code: string, traceback: string): string {
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
  return withDashGuide(basicExplainPrompt(code, boardLines, range), code);
}

function basicExplainPrompt(code: string, boardLines: string, range: LineRange | null): string {
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
