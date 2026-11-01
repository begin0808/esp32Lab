# 範例 16｜手機控制 LED：網頁按鈕與語音控制（開啟、關閉、閃爍）
# 接線：LED 長腳接 GPIO 18，短腳經 220Ω 電阻接 GND
import asyncio
import network
import time
from machine import Pin

# 請改成你的 Wi-Fi 名稱與密碼（ESP32 僅支援 2.4GHz）
SSID = "YOUR_WIFI_SSID"
PASSWORD = "YOUR_WIFI_PASSWORD"

LED_PIN = 18

led = Pin(LED_PIN, Pin.OUT, value=0)
mode = "off"  # 目前的模式：on、off 或 blink

# 手機看到的網頁，內容寫在下面的字串裡
PAGE = """<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ESP32 LED 控制</title>
<style>
body{font-family:Arial,sans-serif;text-align:center;background:#f0f2f5;padding:20px}
button{display:block;width:80%;max-width:300px;margin:15px auto;padding:15px;font-size:20px;color:#fff;border:0;border-radius:12px}
input{display:block;box-sizing:border-box;width:80%;max-width:300px;margin:15px auto;padding:15px;font-size:20px;border:1px solid #888;border-radius:12px}
.on{background:#28a745}.off{background:#dc3545}.blink{background:#ffc107;color:#000}.voice{background:#007bff}
</style></head><body>
<h2>ESP32 LED 控制</h2>
<button class="voice" onclick="startVoice()">🎤 語音控制</button>
<button class="on" onclick="send('on')">開啟</button>
<button class="off" onclick="send('off')">關閉</button>
<button class="blink" onclick="send('blink')">閃爍</button>
<form onsubmit="event.preventDefault();runCommand(this.command.value);this.command.value=''">
<input name="command" placeholder="輸入：開燈、關燈、閃爍" autocomplete="off">
<button class="voice">送出文字指令</button>
</form>
<p id="status">準備就緒</p>
<script>
function show(text){document.getElementById('status').innerText=text}
function send(cmd){fetch('/'+cmd).then(()=>show('目前模式：'+cmd)).catch(()=>show('連線失敗'))}
function runCommand(t){
  if(t.includes('閃'))send('blink');
  else if(t.includes('關')||t.includes('暗'))send('off');
  else if(t.includes('開')||t.includes('亮'))send('on');
  else show('聽不懂「'+t+'」，請說開燈、關燈或閃爍');
}
function startVoice(){
  const Rec=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Rec){show('這個瀏覽器不支援語音辨識，請改用文字指令');return}
  const rec=new Rec();
  rec.lang='zh-TW';
  rec.onresult=e=>{
    const t=e.results[0][0].transcript;
    show('聽到：'+t);
    runCommand(t);
  };
  rec.onerror=e=>{
    if(e.error==='not-allowed'||e.error==='service-not-allowed')show('瀏覽器不允許這個網址使用麥克風。請改用手機，或在文字框輸入指令（Windows 可按 Win+H 語音輸入）');
    else if(e.error==='network')show('語音辨識需要連上網際網路，請確認手機可以上網');
    else show('語音辨識失敗，請再試一次（'+e.error+'）');
  };
  show('聆聽中...');
  rec.start();
}
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


async def handle_client(reader, writer):  # 有人開網頁時，就會執行這裡
    global mode  # 要修改函式外面的 mode
    try:
        # 第一行是請求，例如 GET /on HTTP/1.1
        request = await reader.readline()
        while True:
            header = await reader.readline()  # 把其餘標頭讀完，空行代表結束
            if not header or header == b"\r\n":
                break
        parts = request.split()  # 用空白切開，第二段是網址路徑
        path = parts[1].decode() if len(parts) > 1 else "/"

        if path in ("/on", "/off", "/blink"):  # 網址就是指令
            mode = path[1:]  # 去掉開頭的斜線，例如 /on 變成 on
            if mode != "blink":
                led.value(1 if mode == "on" else 0)
            status, content_type, body = "200 OK", "text/plain", mode
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


async def blink_task():  # 另一個工作，負責閃爍
    while True:
        if mode == "blink":
            led.value(not led.value())
        await asyncio.sleep(0.5)  # 等待時也能繼續處理網頁


async def main():
    ip = connect_wifi()
    # 啟動網頁伺服器，80 是網頁的預設連接埠
    await asyncio.start_server(handle_client, "0.0.0.0", 80)
    print("網頁伺服器已啟動，IP 位址：", ip)
    await blink_task()


asyncio.run(main())
