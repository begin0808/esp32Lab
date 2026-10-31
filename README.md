# ESP32 MicroPython 線上編輯器

免安裝的 ESP32 教學網站：在電腦版 Chrome 或 Edge 貼上 MicroPython 程式，透過 USB 直接上傳到開發板。全部在瀏覽器內執行，不需要後端主機。

## 上課流程

1. 用 USB 線接上開發板，開啟網站，按「連接開發板」。
2. 第一次使用時按「安裝韌體」。之後除非燒錄過 Arduino 程式，否則不用再裝。
3. 按「複製 Gemini 提示詞」，填入功能後貼給 Gemini，再把產生的程式貼回編輯器。
4. 按「上傳並執行」。監控窗會顯示輸出，程式印出 IP 時會自動標示網址。

找不到序列埠時，請確認 USB 線能傳輸資料，並安裝晶片對應的驅動（CP2102 或 CH340）。

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

把新的 `.bin` 放進 `public/firmware/`，再更新 [src/flasher.ts](src/flasher.ts) 的 `FIRMWARE` 網址和 SHA-256。

## 授權

`public/firmware/` 內是未經修改的 [MicroPython](https://micropython.org/) 官方韌體，以 MIT 授權發布，見同資料夾的 LICENSE 檔。
