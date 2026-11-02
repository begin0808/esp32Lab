const LANG_KEY = "esp32-mp-lang";

export type Lang = "zh-Hant" | "en";

export const LANGUAGES: { id: Lang; name: string }[] = [
  { id: "zh-Hant", name: "繁體中文" },
  { id: "en", name: "English" },
];

// The script at the top of each page decides the language, so it applies before the first paint.
export const lang: Lang = typeof document !== "undefined" && document.documentElement.lang === "en" ? "en" : "zh-Hant";

/** The Chinese text is both the source wording and the key, so the code still reads as what students see. */
const en = {
  // Pages
  "ESP32 Lab MicroPython 版（測試 Beta 版）": "ESP32 Lab MicroPython Edition (Beta)",
  "免安裝，開瀏覽器就能寫程式、燒錄 ESP32：貼上 MicroPython 程式碼，透過 USB 直接上傳到開發板。":
    "Nothing to install: write and flash ESP32 programs from the browser. Paste MicroPython code and upload it to the board over USB.",
  "MicroPython 版": "MicroPython Edition",
  "測試 Beta 版": "Beta",
  "ESP32 語音控制｜ESP32 Lab MicroPython 版": "ESP32 Voice Control | ESP32 Lab MicroPython Edition",
  "用手機或電腦的語音，透過 MQTT 控制 ESP32 上的 LED。": "Control an LED on the ESP32 with your voice from a phone or computer, through MQTT.",

  // Editor page
  尚未連接開發板: "Board not connected",
  連接開發板: "Connect board",
  中斷連線: "Disconnect",
  安裝韌體: "Install firmware",
  重新安裝韌體: "Reinstall firmware",
  上傳並執行: "Upload and run",
  停止: "Stop",
  設定與說明: "Settings and help",
  關閉: "Close",
  顯示: "Display",
  風格: "Style",
  程式碼字體大小: "Code font size",
  字體: "Font",
  縮小字體: "Smaller font",
  放大字體: "Larger font",
  說明與工具: "Help and tools",
  使用說明: "Help",
  語音控制頁: "Voice control page",
  腳位圖: "Pinout",
  驅動程式: "Drivers",
  "電腦找不到開發板時才需要。請依板子上的 USB 晶片選擇。": "Only needed when the computer cannot find the board. Choose by the USB chip on your board.",
  "CP210x 驅動程式": "CP210x driver",
  "CH340 驅動程式": "CH340 driver",
  "這個瀏覽器不支援 Web Serial，無法連接開發板。請改用電腦版的 Chrome 或 Edge。":
    "This browser has no Web Serial, so it cannot connect to the board. Please use Chrome or Edge on a computer.",
  "這段程式看起來是 Arduino C++，不能直接在 MicroPython 上執行。": "This code looks like Arduino C++, which cannot run on MicroPython.",
  "複製「改寫成 MicroPython」提示詞": 'Copy the "convert to MicroPython" prompt',
  程式編輯器: "Code editor",
  晶片: "Chip",
  範例: "Example",
  "複製 Gemini 提示詞": "Copy Gemini prompt",
  開啟檔案: "Open file",
  "下載 main.py": "Download main.py",
  調整程式碼與監控窗的寬度: "Resize the code and monitor panels",
  "拖曳調整寬度，連按兩下還原": "Drag to resize, double-click to reset",
  序列埠監控窗: "Serial monitor",
  重新啟動: "Restart",
  清除: "Clear",
  "手機連同一個 Wi-Fi 後，用瀏覽器開啟": "Connect your phone to the same Wi-Fi, then open in its browser",
  複製網址: "Copy address",
  "程式發生錯誤。可以把錯誤訊息和程式碼一起貼給 Gemini 修正。": "The program hit an error. You can paste the error and the code into Gemini to fix it.",
  "複製給 Gemini": "Copy for Gemini",
  "輸入 MicroPython 指令後按 Enter": "Type a command and press Enter",
  傳送: "Send",
  "MicroPython 指令": "MicroPython command",
  "程式執行中，按「停止」後可輸入指令": 'Program running. Press "Stop" to type commands',
  "程式還在執行，請先按「停止」再送出多行程式。": 'The program is still running. Press "Stop" before sending several lines.',
  "↑↓ 之前的指令 · Tab 補字 · Shift+Enter 換行 · Ctrl+C 中斷 ·": "↑↓ earlier commands · Tab completes · Shift+Enter new line · Ctrl+C interrupts ·",
  "REPL 教學": "REPL tutorial",
  "安裝 MicroPython 韌體": "Install MicroPython firmware",
  "開發板上現有的程式和檔案都會被清除。": "All programs and files on the board will be erased.",
  "第一次使用，或從 Arduino 切換過來時才需要安裝。": " You only need this the first time, or when switching from Arduino.",
  "版本：": "Version: ",
  "如果一直連不上，請": "If it keeps failing to connect, ",
  "按住板子上的 IO0（BOOT）鍵": "hold the IO0 (BOOT) button on the board",
  "再重試。": " and try again.",
  "ESP32-S2、S3、C3 的 USB 直接接晶片時，如果連不上，請按住 BOOT 鍵、按一下 RST 鍵、放開 BOOT 鍵，再重新連接開發板。":
    "If the USB of an ESP32-S2, S3 or C3 goes straight to the chip and it will not connect, hold BOOT, press RST once, release BOOT, then connect again.",
  "安裝期間請不要拔除 USB 線。": "Do not unplug the USB cable during installation.",
  取消: "Cancel",
  清除並安裝: "Erase and install",
  "程式碼只會留在這台電腦的瀏覽器和你的開發板上，不會上傳到任何伺服器。內含": "Your code stays in this browser and on your board, and is never uploaded to a server. Includes ",
  "韌體（MIT 授權）。腳位圖來源：": " firmware (MIT license). Pinout source: ",
  "（": " (",
  "）。": ").",
  "Studio0808 智造實驗室": "Studio0808",
  "如有建議或報錯，歡迎來信": "Suggestions and bug reports are welcome",
  寫信給我: "Email me",

  // Example menu
  基礎輸出與輸入: "Basic output and input",
  "LED 閃爍": "Blink an LED",
  "按鈕開關 LED": "Button-controlled LED",
  "呼吸燈（PWM）": "Breathing LED (PWM)",
  可變電阻調亮度: "Potentiometer LED dimmer",
  無源蜂鳴器播放小星星: "Twinkle Twinkle on a passive buzzer",
  "SG90 伺服馬達來回轉動": "SG90 servo sweep",
  感測器: "Sensors",
  光敏電阻自動夜燈: "Automatic night light (photoresistor)",
  "人體紅外線警報（HC-SR501）": "Motion alarm (HC-SR501)",
  "超音波測距（HC-SR04）": "Ultrasonic distance (HC-SR04)",
  "DHT11 溫濕度（監控窗）": "DHT11 temperature and humidity (monitor)",
  "DS18B20 溫度計": "DS18B20 thermometer",
  顯示與燈光: "Displays and lights",
  "WS2812 全彩 LED 彩虹": "WS2812 RGB LED rainbow",
  "SSD1306 OLED 顯示器": "SSD1306 OLED display",
  "I2C LCD 1602 顯示器": "I2C LCD 1602 display",
  "MAX7219 點矩陣": "MAX7219 LED matrix",
  "Wi-Fi 與語音": "Wi-Fi and voice",
  "手機控制 LED（同一個 Wi-Fi）": "Phone-controlled LED (same Wi-Fi)",
  "語音控制 LED（MQTT）": "Voice-controlled LED (MQTT)",
  "DHT11 溫濕度警報": "DHT11 humidity alarm",
  "Telegram 機器人控制 LED": "Telegram bot LED",
  "DHT11 資料存到 Google 試算表": "Log DHT11 data to Google Sheets",
  "選擇範例…": "Choose an example…",
  "要用「{name}」取代目前的程式嗎？": 'Replace the current program with "{name}"?',

  // Editor messages
  "[系統]": "[System]",
  "偵測到 {chip}，之後選範例會使用這種晶片的腳位。編輯器裡現有的程式不會自動修改。":
    "Detected {chip}. Examples you choose from now on will use this chip's pins. The code already in the editor is not changed.",
  "開發板回報錯誤：{message}": "The board reported an error: {message}",
  "正在偵測 MicroPython": "Looking for MicroPython",
  "，快閃記憶體 {size} MB": ", {size} MB flash",
  "已連接：{machine}{flash}，MicroPython {release}": "Connected: {machine}{flash}, MicroPython {release}",
  "開發板就緒：{machine}{flash}，MicroPython {release}": "Board ready: {machine}{flash}, MicroPython {release}",
  "已連接，但沒有偵測到 MicroPython，請先安裝韌體": "Connected, but MicroPython was not found. Please install the firmware first",
  "沒有偵測到 MicroPython。第一次使用，或之前燒錄過 Arduino 程式時，請按「安裝韌體」。":
    'MicroPython was not found. On first use, or after flashing an Arduino program, press "Install firmware".',
  連接失敗: "Connection failed",
  "連接失敗：{message}。如果其他程式（例如 Arduino IDE）正在使用序列埠，請先關閉。":
    "Connection failed: {message}. If another program (such as the Arduino IDE) is using the serial port, close it first.",
  "這段程式看起來是 Arduino C++，上傳後會出現語法錯誤。仍要上傳嗎？": "This code looks like Arduino C++ and will give a syntax error. Upload it anyway?",
  正在上傳程式: "Uploading the program",
  程式執行中: "Program running",
  上傳失敗: "Upload failed",
  "上傳失敗：{message}": "Upload failed: {message}",
  程式已停止: "Program stopped",
  "開始安裝 {version}，會依晶片自動選擇韌體": "Installing {version}. The firmware is chosen automatically for your chip",
  正在寫入韌體: "Writing the firmware",
  韌體安裝完成: "Firmware installed",
  韌體安裝失敗: "Firmware installation failed",
  "韌體安裝失敗：{message}。請按住 BOOT 鍵，按一下 RST 鍵，再放開 BOOT 鍵，然後重新按「連接開發板」並再裝一次。":
    'Firmware installation failed: {message}. Hold BOOT, press RST once, release BOOT, then press "Connect board" and install again.',
  "韌體安裝失敗：{message}。連不上時，請按住 IO0 鍵再重試。": "Firmware installation failed: {message}. If it cannot connect, hold the IO0 button and try again.",
  "請按一下板子上的 RST 鍵，再按「連接開發板」": 'Press the RST button on the board, then "Connect board"',
  "請按一下板子上的 RST 鍵，等 2 秒，再按「連接開發板」並重新選擇序列埠。": 'Press the RST button on the board, wait 2 seconds, then press "Connect board" and choose the serial port again.',
  "無法重新連接開發板：{message}": "Could not reconnect to the board: {message}",
  已複製: "Copied",
  複製失敗: "Copy failed",
  "開發板連線中斷，請檢查 USB 線後重新連接": "Lost the board. Check the USB cable and connect again",
  開發板連線中斷: "Lost the connection to the board",
  "{version}（依晶片自動選擇）": "{version} (chosen automatically for your chip)",
  "切換語言會重新載入頁面並中斷開發板連線，要繼續嗎？": "Changing the language reloads the page and disconnects the board. Continue?",

  // Firmware and board errors
  "無法下載韌體（HTTP {status}）": "Could not download the firmware (HTTP {status})",
  "韌體檔案驗證失敗，請重新整理網頁再試一次": "The firmware file failed verification. Reload the page and try again",
  "正在連接開發板（連不上時請按住 IO0 鍵）": "Connecting to the board (hold the IO0 button if it cannot connect)",
  "正在重新連接開發板（第 {count} 次）": "Connecting to the board again (try {count})",
  "[連線紀錄：回報問題時請一起提供]": "[Connection log: please include it when reporting a problem]",
  "這塊板子是 {chip}，目前只支援 ESP32、ESP32-S2、S3 和 C3": "This board is an {chip}. Only ESP32, ESP32-S2, S3 and C3 are supported",
  "快閃記憶體只有 {size}，至少需要 {min}MB": "The flash is only {size}, and at least {min}MB is needed",
  "正在下載 {chip} 的韌體": "Downloading the firmware for {chip}",
  正在清除快閃記憶體: "Erasing the flash",
  正在重新啟動: "Restarting",
  "沒有偵測到 MicroPython": "MicroPython was not found",
  "檔案驗證失敗，請重新上傳": "The file failed verification. Please upload again",
  等待開發板回應逾時: "Timed out waiting for the board",
  尚未選擇序列埠: "No serial port selected",
  開發板尚未連接: "The board is not connected",

  // Text that goes into the board's program or a prompt
  "- 開發板：NodeMCU ESP-32S（ESP32，MicroPython v1.29.0）\n- 板載 LED：GPIO 2": "- Board: NodeMCU ESP-32S (ESP32, MicroPython v1.29.0)\n- Onboard LED: GPIO 2",
  "- 開發板：{label}（MicroPython v1.29.0）\n- 板載 LED：（請看板子標示填寫，不同板子的腳位不同）":
    "- Board: {label} (MicroPython v1.29.0)\n- Onboard LED: (check your board's markings; the pin differs between boards)",
  "# 接線：LED 經 220Ω 電阻接 GPIO {pin}，短腳接 GND（各板子的板載 LED 腳位不同）": "# Wiring: LED through a 220Ω resistor to GPIO {pin}, short leg to GND (the onboard LED pin differs between boards)",
  "# 腳位已依 {chip} 調整。不同板子引出的腳位可能不同，請對照板子標示": "# Pins adjusted for {chip}. Boards expose different pins, so check your board's markings",

  // Style names and the visit counter
  切割墊工作台: "Cutting mat workbench",
  積木玩具: "Toy blocks",
  "累計瀏覽 {count} 人次": "{count} views",

  // Voice control page
  "ESP32 語音控制": "ESP32 Voice Control",
  "MQTT 主題名稱（Topic）": "MQTT topic name",
  序列埠監控窗顯示的主題名稱: "Topic name from the monitor",
  連線: "Connect",
  "進階：自訂 MQTT 伺服器與帳號密碼": "Advanced: custom MQTT broker and login",
  伺服器位址: "Broker address",
  "WSS 連接埠": "WSS port",
  路徑: "Path",
  帳號: "Username",
  密碼: "Password",
  公用伺服器不用填: "Not needed for a public broker",
  "這一頁只能使用加密的 WSS 連線，改完按「連線」生效。開發板程式的 BROKER、MQTT_PORT 要指向同一台伺服器，但連接埠通常不同，例如 1883。帳號和密碼也要填進程式的 MQTT_USER、MQTT_PASSWORD。密碼不會儲存，重新整理後要再輸入一次。":
    'This page can only use encrypted WSS connections. Press "Connect" to apply changes. BROKER and MQTT_PORT in the board\'s program must point to the same broker, usually on a different port such as 1883. The username and password also go into MQTT_USER and MQTT_PASSWORD. The password is not saved, so enter it again after reloading.',
  還原預設: "Reset to default",
  尚未連線: "Not connected",
  "開發板：尚未回報": "Board: no report yet",
  "🎤 按一下，對麥克風說出指令": "🎤 Press and say a command",
  開燈: "On",
  關燈: "Off",
  閃爍: "Blink",
  文字指令: "Text command",
  也可以用鍵盤的麥克風輸入: "Or use keyboard dictation",
  送出: "Send",
  回程式編輯頁: "Back to the editor",
  查看使用說明: "View help",
  "指令會經過 MQTT 伺服器（預設是公用的 broker.emqx.io），知道主題名稱的人都能控制，請勿用於重要設備，也不要在主題名稱填入個人資料。":
    "Commands pass through an MQTT broker (the public broker.emqx.io by default), and anyone who knows the topic name can send them. Do not use this for anything important, and keep personal details out of the topic name.",
  "開發板：LED 開啟": "Board: LED on",
  "開發板：LED 關閉": "Board: LED off",
  "開發板：LED 閃爍": "Board: LED blinking",
  "開發板：離線，請確認程式正在執行": "Board: offline. Check that the program is running",
  正在連線: "Connecting",
  "已連線，主題：{name}": "Connected, topic: {name}",
  "連不上伺服器，正在重試。請確認這台裝置可以上網，以及伺服器設定正確": "Cannot reach the broker, retrying. Check that this device is online and the broker settings are correct",
  "MQTT 帳號或密碼不正確，或這個帳號沒有使用權限": "The MQTT username or password is wrong, or this account lacks permission",
  "開發板：沒有回應，請確認主題名稱和程式是否正在執行": "Board: no response. Check the topic name and that the program is running",
  "收到：{text}": "Received: {text}",
  "聽不懂「{text}」，請說開燈、關燈或閃爍": 'Did not understand "{text}". Please say on, off or blink',
  "麥克風沒有開放，請到瀏覽器的網站設定允許使用麥克風": "The microphone is blocked. Allow it in the browser's site settings",
  "語音辨識需要連上網際網路，請確認這台裝置可以上網": "Speech recognition needs the internet. Check that this device is online",
  "沒有聽到聲音，請再試一次": "No speech heard, please try again",
  "語音辨識失敗，請再試一次（{error}）": "Speech recognition failed, please try again ({error})",
  "這個瀏覽器不支援語音辨識，請改用文字指令或鍵盤的麥克風": "This browser has no speech recognition. Please use text commands or your keyboard's microphone",
  "聆聽中，請說話": "Listening, please speak",
  主題名稱: "topic-name",
  "實際使用的 Topic：{command}（指令）、{state}（回報）": "Topics in use: {command} (commands), {state} (reports)",
  "主題名稱只能使用英文、數字、底線和連字號，最多 32 個字": "Topic names can only use English letters, digits, underscores and hyphens, up to 32 characters",
  "伺服器設定不正確：連接埠是 1–65535 的數字，路徑以 / 開頭": "The broker settings are not valid: the port must be a number from 1 to 65535, and the path must start with /",
  有填密碼時也要填帳號: "A password also needs a username",
  "請輸入 MQTT 密碼後按「連線」": 'Enter the MQTT password and press "Connect"',
  版本: "Version",
  監控窗顯示方式: "Monitor view",
  文字: "Text",
  圖表: "Chart",
  顯示最近: "Show the last",
  "10 秒": "10 seconds",
  "30 秒": "30 seconds",
  "1 分鐘": "1 minute",
  "5 分鐘": "5 minutes",
  "10 分鐘": "10 minutes",
  暫停: "Pause",
  繼續: "Resume",
  "匯出 CSV": "Export CSV",
  序列埠資料折線圖: "Line chart of the serial data",
  圖例: "Legend",
  "還沒有可以畫圖的資料。程式用": "No data to chart yet. Print numbers in a form such as",
  'print("溫度:", t)': 'print("temp:", t)',
  "這樣的格式印出數字，就會畫成折線圖。": "and they are drawn as a line chart.",
  圖表教學: "Chart tutorial",
  "數值{position}": "value{position}",
  "時間（秒）": "time (s)",
  "畫面已暫停，資料仍在背景記錄": "Paused. Data is still being recorded",
  "只保留最近 {count} 筆，較早的資料已捨棄": "Only the latest {count} rows are kept; older data was dropped",
  點一下隱藏或顯示這條線: "Click to hide or show this line",
  "要清除圖表的所有資料嗎？還沒匯出的資料會不見。": "Clear all chart data? Anything not exported will be lost.",
};

export type TextKey = keyof typeof en;

/** Returns the text in the page's language, filling in {name} placeholders. */
export function t(key: TextKey, params: Record<string, string | number> = {}): string {
  const template = lang === "en" ? en[key] : key;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

function translate(text: string | null): string | null {
  const trimmed = text?.trim();
  if (!text || !trimmed) return null;
  const english = en[trimmed as TextKey];
  return english ? text.replace(trimmed, () => english) : null;
}

/** Pages are written in Chinese, so English replaces their text in place and the markup needs no extra attributes. */
export function translatePage(): void {
  if (lang !== "en") return;
  document.title = translate(document.title) ?? document.title;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const english = translate(walker.currentNode.nodeValue);
    if (english) walker.currentNode.nodeValue = english;
  }
  const attributes = ["placeholder", "aria-label", "title"];
  for (const node of document.querySelectorAll(attributes.map((name) => `[${name}]`).join())) {
    for (const name of attributes) {
      const english = translate(node.getAttribute(name));
      if (english) node.setAttribute(name, english);
    }
  }
  const description = document.querySelector('meta[name="description"]');
  const english = translate(description?.getAttribute("content") ?? null);
  if (english) description!.setAttribute("content", english);
  document.documentElement.classList.remove("translating");
}

function saveLanguage(next: Lang): void {
  try {
    localStorage.setItem(LANG_KEY, next);
  } catch {
    // Without storage the choice cannot outlive this page.
  }
}

/** The help page is a separate file for each language; every other page reloads and translates itself. */
function openInLanguage(next: Lang): void {
  const url = new URL(location.href);
  url.pathname = next === "en" ? url.pathname.replace(/\/help\.html$/, "/help.en.html") : url.pathname.replace(/\/help\.en\.html$/, "/help.html");
  if (url.href === location.href) location.reload();
  else location.href = url.href;
}

interface LanguagePickerOptions {
  /** May ask the student first, because reloading the editor would drop its board connection. */
  allowSwitch?: () => boolean;
  /** Whether this tab can safely reload when the language is changed in another tab. */
  canFollow?: () => boolean;
}

export function setupLanguagePicker(picker: HTMLSelectElement, { allowSwitch = () => true, canFollow = () => true }: LanguagePickerOptions = {}): void {
  picker.append(...LANGUAGES.map((language) => new Option(language.name, language.id)));
  picker.value = lang;
  picker.addEventListener("change", () => {
    if (!allowSwitch()) {
      picker.value = lang;
      return;
    }
    const next = picker.value as Lang;
    saveLanguage(next);
    openInLanguage(next);
  });
  window.addEventListener("storage", (event) => {
    if (event.key !== LANG_KEY || !LANGUAGES.some((language) => language.id === event.newValue)) return;
    if (event.newValue !== lang && canFollow()) openInLanguage(event.newValue as Lang);
  });
}
