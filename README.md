# ESP32 Lab 線上實驗室（測試 Beta 版）

線上使用：<https://begin0808.github.io/esp32Lab/>

免安裝的 ESP32 教學網站：在電腦版 Chrome 或 Edge 貼上 MicroPython 程式，透過 USB 直接上傳到開發板。全部在瀏覽器內執行，不需要後端主機。

## 上課流程

1. 用 USB 線接上開發板，開啟網站，按「連接開發板」。
2. 第一次使用時按「安裝韌體」。之後除非燒錄過 Arduino 程式，否則不用再裝。
3. 按「複製 Gemini 提示詞」，填入功能後貼給 Gemini，再把產生的程式貼回編輯器。
4. 按「上傳並執行」。監控窗會顯示輸出，程式印出 IP 時會自動標示網址。

找不到序列埠時，請確認 USB 線能傳輸資料，並安裝晶片對應的驅動（CP2102 或 CH340）。

## 語音控制

手機或電腦的瀏覽器只允許 HTTPS 網頁使用麥克風，所以語音指令不是直接送到開發板的 `http://` 網頁，而是由 `voice.html` 經 MQTT 伺服器轉送：

1. 範例選「語音控制 LED（MQTT）」，填入 Wi-Fi 後上傳。開發板的 Wi-Fi 必須能上網。
2. 開啟語音控制頁，輸入監控窗顯示的 MQTT 主題名稱，按「連線」。
3. 按語音按鈕，允許麥克風，說「開燈」、「關燈」或「閃爍」。

預設使用公用伺服器 `broker.emqx.io`，訊息未加密保護且沒有權限控管，只適合 LED 這類低風險的實驗，也不要傳送個人資料。要用自己的伺服器時，請在語音控制頁的「進階」填入位址和帳號密碼，並修改程式裡的對應設定。語音控制頁不會儲存密碼。

## 使用說明

`help.html` 列出支援的開發板、電子元件和注意事項，並跟隨使用者選擇的風格。實測新硬體後，請更新頁面的狀態標籤和更新日期。

## 開發

```
npm install
npm run dev        # 開發伺服器
npm test           # 單元測試
npm run test:e2e   # 瀏覽器測試（使用模擬開發板）
npm run build      # 輸出到 dist/
```

## 部署

推送到 GitHub 的 `main` 分支後，`.github/workflows/deploy.yml` 會自動部署。第一次要到儲存庫的 Settings → Pages，把 Source 設為 GitHub Actions。

## 更換韌體版本

把新的 `.bin` 放進 `public/firmware/`，再更新 [src/chips.ts](src/chips.ts) 裡各晶片的網址和 SHA-256。

## 授權

`public/firmware/` 內是未經修改的 [MicroPython](https://micropython.org/) 官方韌體，以 MIT 授權發布，見同資料夾的 LICENSE 檔。

「積木玩具」風格使用的 Huninn 字體以 SIL Open Font License 1.1 授權，見 `public/fonts/`。

---

© 2026 [Studio0808 智造實驗室](https://begin0808.github.io/studio0808/). All rights reserved.

如有建議或報錯，[歡迎來信](https://mail.google.com/mail/?view=cm&fs=1&to=begin0808@gmail.com)。
