# 範例 18｜DHT11 溫濕度監測：手機網頁每 2 秒更新，濕度超過 50% 發出警報
# 接線：DHT11 VCC 接 3V3、GND 接 GND、DATA 接 GPIO 4
import asyncio
import dht
import json
import network
import time
from machine import Pin

# 請改成你的 Wi-Fi 名稱與密碼（ESP32 僅支援 2.4GHz）
SSID = "YOUR_WIFI_SSID"
PASSWORD = "YOUR_WIFI_PASSWORD"

DHT_PIN = 4

sensor = dht.DHT11(Pin(DHT_PIN))
latest = {"error": True}  # 最新的感測結果，一開始還沒有資料

# 手機看到的網頁，會自己定時更新
PAGE = """<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ESP32 溫濕度監測</title>
<style>
body{font-family:Arial,sans-serif;text-align:center;background:#f0f2f5;padding:20px}
.cards{display:flex;justify-content:center;gap:15px;flex-wrap:wrap;margin-top:15px}
.card{background:#fff;padding:20px;border-radius:15px;box-shadow:0 4px 10px rgba(0,0,0,.1);width:140px}
.val{font-size:32px;font-weight:bold;margin:10px 0}
.alarm{background:#ffdddd;outline:2px solid #ff4d4d}
button{padding:12px 24px;font-size:16px;background:#28a745;color:#fff;border:0;border-radius:10px}
</style></head><body>
<h2>🌡 ESP32 溫濕度監測</h2>
<button id="sound" onclick="enableAudio()">🔊 點擊啟用聲音警報</button>
<div class="cards">
  <div class="card"><div>溫度</div><div class="val"><span id="temp">--</span> °C</div></div>
  <div class="card" id="humCard"><div>濕度</div><div class="val"><span id="hum">--</span> %</div></div>
</div>
<p id="status">讀取中...</p>
<script>
let audio=null;
function enableAudio(){
  audio=new (window.AudioContext||window.webkitAudioContext)();
  audio.resume();
  document.getElementById('sound').innerText='✅ 聲音警報已啟用';
}
function beep(){
  if(!audio)return;
  const osc=audio.createOscillator();
  osc.frequency.value=880;
  osc.connect(audio.destination);
  osc.start();
  osc.stop(audio.currentTime+0.3);
}
function update(){
  fetch('/data').then(r=>r.json()).then(d=>{
    const status=document.getElementById('status');
    if(d.error){status.innerText='⚠️ 感測器讀取失敗，請檢查接線';return}
    document.getElementById('temp').innerText=d.temp;
    document.getElementById('hum').innerText=d.hum;
    status.innerText='最後更新：'+new Date().toLocaleTimeString();
    const high=d.hum>50;
    document.getElementById('humCard').classList.toggle('alarm',high);
    if(high)beep();
  }).catch(()=>{document.getElementById('status').innerText='連線異常'});
}
update();
setInterval(update,2000);
</script></body></html>"""


def connect_wifi():
    wlan = network.WLAN()  # 建立 Wi-Fi 連線物件
    wlan.active(True)  # 開啟 Wi-Fi 功能
    wlan.connect(SSID, PASSWORD)  # 開始連線，要等一下才會連上
    print("正在連線 Wi-Fi", end="")
    for _ in range(40):  # 最多等 40 次，每次 0.5 秒，共 20 秒
        if wlan.isconnected():
            print()
            return wlan.ipconfig("addr4")[0]
        print(".", end="")
        time.sleep(0.5)
    raise RuntimeError("Wi-Fi 連線失敗，請檢查名稱、密碼，以及是否為 2.4GHz")


async def handle_client(reader, writer):  # 有人開網頁或要資料時，就會執行這裡
    try:
        # 第一行是請求，例如 GET /on HTTP/1.1
        request = await reader.readline()
        while True:
            header = await reader.readline()  # 把其餘標頭讀完，空行代表結束
            if not header or header == b"\r\n":
                break
        parts = request.split()  # 用空白切開，第二段是網址路徑
        path = parts[1].decode() if len(parts) > 1 else "/"

        if path == "/data":  # 網頁用這個網址取得 JSON 格式的資料
            status, content_type, body = "200 OK", "application/json", json.dumps(latest)
        elif path == "/":
            status, content_type, body = "200 OK", "text/html; charset=utf-8", PAGE
        else:
            status, content_type, body = "404 Not Found", "text/plain", "not found"

        data = body.encode()  # 網路傳的是位元組，中文也要先轉換
        writer.write("HTTP/1.1 {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n".format(status, content_type, len(data)).encode())
        writer.write(data)  # 接著送出內容
        await writer.drain()  # 等資料真的送出去
    finally:
        writer.close()  # 不管成功或失敗都要關閉連線
        await writer.wait_closed()


async def sensor_task():  # 另一個工作，負責定時讀感測器
    # DHT11 每 2 秒最多讀取一次，所以集中在這裡讀取，網頁只取最新的結果
    global latest
    while True:
        try:
            sensor.measure()
            latest = {"temp": sensor.temperature(), "hum": sensor.humidity()}
            print("溫度", latest["temp"], "°C，濕度", latest["hum"], "%")
        except OSError:
            latest = {"error": True}
            print("感測器讀取失敗，請檢查接線")
        await asyncio.sleep(2)  # 等待時也能繼續處理網頁


async def main():
    ip = connect_wifi()
    # 啟動網頁伺服器，80 是網頁的預設連接埠
    await asyncio.start_server(handle_client, "0.0.0.0", 80)
    print("網頁伺服器已啟動，IP 位址：", ip)
    await sensor_task()


asyncio.run(main())
