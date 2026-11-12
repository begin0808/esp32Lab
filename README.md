# ESP32 Lab MicroPython 版（測試 Beta 版）

繁體中文 | [English](README.en.md)

線上使用：<https://begin0808.github.io/esp32Lab/>

免安裝的 ESP32 教學網站：在電腦版 Chrome、Edge 或 Chromebook 貼上 MicroPython 程式，透過 USB 直接上傳到開發板。全部在瀏覽器內執行，不需要後端主機。

## 上課流程

1. 用 USB 線接上開發板，開啟網站，按「連接開發板」。
2. 第一次使用時按「安裝韌體」。之後除非燒錄過 Arduino 程式，否則不用再裝。
3. 按「Gemini 提示詞」→「寫新程式」，填入功能後貼給 Gemini，再把產生的程式貼回編輯器。
4. 按「上傳並執行」。監控窗會顯示輸出，程式印出 IP 時會自動標示網址。

找不到序列埠時，請確認 USB 線能傳輸資料，並安裝晶片對應的驅動（CP2102 或 CH340）。

## REPL

按「停止」後，可以在監控窗下方直接輸入 MicroPython 指令，並立刻看到結果。方向鍵可以叫回之前的指令，Tab 會補字，結尾是冒號的程式區塊可以寫成多行，空一行後按 Enter 整段執行。之前的指令只留在記憶體，不會存進瀏覽器，因為裡面可能有密碼。教學在使用說明的 REPL 章節。

## 圖表與 CSV

監控窗可以切換到「圖表」，把 `print("溫度:", t)` 這類「名稱:數字」或只有數字的輸出畫成折線圖，可選看最近 10 秒、30 秒、1 分鐘、5 分鐘或 10 分鐘。記錄的資料可以匯出成 CSV，用 Excel 打開中文也不會變亂碼。圖表用瀏覽器內建的 Canvas 繪製，沒有另外的套件，程式在 `src/plot.ts`（解析與資料）和 `src/plotter.ts`（繪圖）。

## Gemini 提示詞

所有提示詞都在 `src/text.ts`：`geminiPrompt`（寫新程式）、`explainPrompt`（解說程式）、`fixErrorPrompt`（修正錯誤）、`arduinoConvertPrompt`（改寫 Arduino 程式），送出前都會用 `hideWifiSettings` 隱藏密碼。「解說程式」會替程式碼加上行號；在編輯器選取幾行時，`selectedLineRange` 算出行號範圍，提示詞只請 Gemini 解說那幾行，但仍附上整份程式。

## 執行（不存檔）

「執行（不存檔）」和 mpremote 的 `run` 一樣：進入 raw REPL、軟重開（不會執行 `main.py`），送出程式後就把輸出交給監控窗，不寫入快閃記憶體。程式結束時板子會送出 Ctrl-D 和 `>`，網站看到後離開 raw REPL，所以變數會留在 REPL 裡可以查看。連接開發板時 F5 也會執行。程式在 `src/rawrun.ts`（追蹤程式何時結束）和 `src/main.ts`。

## 板上檔案

編輯器上方的「板上檔案」可以列出開發板裡的檔案和剩餘空間，進出資料夾，把文字檔開到編輯器、下載、刪除，從電腦上傳檔案（可以拖進視窗），或把編輯器內容存成其他檔名，例如自己寫的 `mylib.py`。視窗打開期間，網站一直使用 raw REPL，所以板子上的程式會停止。下載也用 SHA-256 驗證。程式在 `src/files.ts`（路徑與解析）和 `src/filemanager.ts`（視窗）。

## 語音控制

手機或電腦的瀏覽器只允許 HTTPS 網頁使用麥克風，所以語音指令不是直接送到開發板的 `http://` 網頁，而是由 `voice.html` 經 MQTT 伺服器轉送：

1. 範例選「語音控制 LED（MQTT）」，填入 Wi-Fi 後上傳。開發板的 Wi-Fi 必須能上網。
2. 開啟語音控制頁，輸入監控窗顯示的 MQTT 主題名稱，按「連線」。
3. 按語音按鈕，允許麥克風，說「開燈」、「關燈」或「閃爍」。

預設使用公用伺服器 `broker.emqx.io`，訊息未加密保護且沒有權限控管，只適合 LED 這類低風險的實驗，也不要傳送個人資料。要用自己的伺服器時，請在語音控制頁的「進階」填入位址和帳號密碼，並修改程式裡的對應設定。語音控制頁不會儲存密碼。

## 手機儀表板

`dashboard.html` 是手機儀表板頁，和語音控制頁一樣經 MQTT 伺服器連線，畫面由開發板的程式決定：

1. 範例選「27. 儀表板入門」，填入 Wi-Fi 後上傳。用到 `import dash` 的程式，網站會先把 `src/lib/dash.py` 存到板子的 `/lib/dash.py`，板子上已經是同一份時就跳過（比對 SHA-256）。
2. 開發板連上 MQTT 伺服器後會印出儀表板網址，監控窗上方會顯示網址和 QR code，手機一掃就開。
3. 程式用 `board.gauge()`、`board.switch()` 這類寫法建立元件（共 17 種），手機頁會依開發板送出的 `layout` 自動排出來。
4. 請 Gemini 寫儀表板程式時，用「Gemini 提示詞」→「寫手機儀表板程式」。dash 的寫法說明在 `src/text.ts` 的 `dashGuide`，Gemini 沒看過 `dash.py`，所以提示詞一定要附上它。

全部資料在 `esp32-mp-class/<主題名稱>/dash/` 底下：`layout`（畫面）、`state`（在線狀態）、`out/<id>`（板子送的值）、`in/<id>`（手機的操作）。手機頁把收到的資料都當成不可信的內容處理，只用文字顯示。`dash.py` 在電腦上的測試是 `tests/dash/test_dash.py`，用假的 Wi-Fi、MQTT 和時鐘執行，單元測試會一起跑。

## 使用說明

`help.html`（中文）和 `help.en.html`（英文）列出支援的開發板、電子元件和注意事項，並跟隨使用者選擇的風格。實測新硬體後，請同時更新兩個頁面的狀態標籤和更新日期。

## 學習路徑

說明頁的「學習路徑」把 26 個範例分成初階、中階、進階，每一步有學到的觀念和「動手改改看」，每一級有建議時數和材料清單。範例名稱連到 `index.html?example=<檔名>`：從編輯器打開的說明頁會先確認，再把範例傳回原本的編輯器分頁，所以開發板連線不會中斷；單獨打開的說明頁則開啟編輯器，由編輯器確認。範例清單和編號在 `src/catalog.ts`，新增範例時也要加進兩個說明頁的學習路徑，漏了 `npm test` 會失敗。

## 中英文介面

中文瀏覽器預設顯示中文，其他語言的瀏覽器預設顯示英文，也可以在「設定與說明」切換並記住選擇。

- 介面文字：頁面和程式都以中文撰寫，英文放在 [src/i18n.ts](src/i18n.ts) 的字典，以中文原文為鍵。程式裡的文字用 `t("中文")`，字典少了這個鍵時 `npm run build` 會失敗。HTML 裡的文字會自動替換，漏翻時 `npm run test:e2e` 會失敗。
- 範例：`src/examples/` 是中文版，`src/examples/en/` 是英文版。改了範例的程式邏輯，兩邊都要改，兩邊不一致時 `npm test` 會失敗。
- README：`README.md` 和 `README.en.md` 要一起更新。
- 說明頁：內容多，所以兩種語言各是一個檔案。兩邊的章節和表格列數不一致時 `npm run test:e2e` 會失敗。

## 開發

```
npm install
npm run dev        # 開發伺服器
npm test           # 單元測試
npm run test:e2e   # 瀏覽器測試（使用模擬開發板）
npm run build      # 輸出到 dist/
```

上傳程式時和 mpremote 一樣使用 raw REPL 的 raw-paste 模式，由開發板控制傳送速度；檔案每 2 KB 一段、以 base64 傳送，先寫成暫存檔，用 SHA-256 驗證後才取代 `main.py`。韌體不支援 raw-paste 模式時，會自動改用一般 raw REPL。程式在 [src/repl.ts](src/repl.ts)。

## 部署

推送到 GitHub 的 `main` 分支後，`.github/workflows/deploy.yml` 會自動部署。第一次要到儲存庫的 Settings → Pages，把 Source 設為 GitHub Actions。

## 更換韌體版本

把新的 `.bin` 放進 `public/firmware/`，再更新 [src/chips.ts](src/chips.ts) 裡各晶片的網址和 SHA-256。

## 瀏覽統計

[src/stats.ts](src/stats.ts) 把正式網址的頁面瀏覽記錄到 GoatCounter，並在頁尾顯示編輯器頁面的累計人次。頁面會暫存含 Wi-Fi 密碼的程式碼，所以不載入第三方 JavaScript，也不送出網址參數。本機開發和測試不會計入。

## 授權

`public/firmware/` 內是未經修改的 [MicroPython](https://micropython.org/) 官方韌體，以 MIT 授權發布，見同資料夾的 LICENSE 檔。

「積木玩具」風格使用的 Huninn 字體以 SIL Open Font License 1.1 授權，見 `public/fonts/`。

---

© 2026 [Studio0808 智造實驗室](https://begin0808.github.io/studio0808/). All rights reserved.

如有建議或報錯，[歡迎來信](https://mail.google.com/mail/?view=cm&fs=1&to=begin0808@gmail.com)。
