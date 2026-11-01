# DHT11 monitor: a phone web page updates every 2 seconds and alarms when humidity is over 50%
# Wiring: DHT11 VCC to 3V3, GND to GND, DATA to GPIO 4
import asyncio
import dht
import json
import network
import time
from machine import Pin

# Change these to your Wi-Fi name and password (ESP32 only supports 2.4GHz)
SSID = "YOUR_WIFI_SSID"
PASSWORD = "YOUR_WIFI_PASSWORD"

DHT_PIN = 4

sensor = dht.DHT11(Pin(DHT_PIN))
latest = {"error": True}

PAGE = """<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ESP32 Temperature and Humidity</title>
<style>
body{font-family:Arial,sans-serif;text-align:center;background:#f0f2f5;padding:20px}
.cards{display:flex;justify-content:center;gap:15px;flex-wrap:wrap;margin-top:15px}
.card{background:#fff;padding:20px;border-radius:15px;box-shadow:0 4px 10px rgba(0,0,0,.1);width:140px}
.val{font-size:32px;font-weight:bold;margin:10px 0}
.alarm{background:#ffdddd;outline:2px solid #ff4d4d}
button{padding:12px 24px;font-size:16px;background:#28a745;color:#fff;border:0;border-radius:10px}
</style></head><body>
<h2>🌡 ESP32 Temperature and Humidity</h2>
<button id="sound" onclick="enableAudio()">🔊 Tap to enable the sound alarm</button>
<div class="cards">
  <div class="card"><div>Temperature</div><div class="val"><span id="temp">--</span> °C</div></div>
  <div class="card" id="humCard"><div>Humidity</div><div class="val"><span id="hum">--</span> %</div></div>
</div>
<p id="status">Reading...</p>
<script>
let audio=null;
function enableAudio(){
  audio=new (window.AudioContext||window.webkitAudioContext)();
  audio.resume();
  document.getElementById('sound').innerText='✅ Sound alarm enabled';
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
    if(d.error){status.innerText='⚠️ Could not read the sensor. Check the wiring';return}
    document.getElementById('temp').innerText=d.temp;
    document.getElementById('hum').innerText=d.hum;
    status.innerText='Last update: '+new Date().toLocaleTimeString();
    const high=d.hum>50;
    document.getElementById('humCard').classList.toggle('alarm',high);
    if(high)beep();
  }).catch(()=>{document.getElementById('status').innerText='Connection problem'});
}
update();
setInterval(update,2000);
</script></body></html>"""


def connect_wifi():
    wlan = network.WLAN()
    wlan.active(True)
    wlan.connect(SSID, PASSWORD)
    print("Connecting to Wi-Fi", end="")
    for _ in range(40):
        if wlan.isconnected():
            print()
            return wlan.ipconfig("addr4")[0]
        print(".", end="")
        time.sleep(0.5)
    raise RuntimeError("Wi-Fi connection failed. Check the name, the password, and that the network is 2.4GHz")


async def handle_client(reader, writer):
    try:
        request = await reader.readline()
        while True:
            header = await reader.readline()
            if not header or header == b"\r\n":
                break
        parts = request.split()
        path = parts[1].decode() if len(parts) > 1 else "/"

        if path == "/data":
            status, content_type, body = "200 OK", "application/json", json.dumps(latest)
        elif path == "/":
            status, content_type, body = "200 OK", "text/html; charset=utf-8", PAGE
        else:
            status, content_type, body = "404 Not Found", "text/plain", "not found"

        data = body.encode()
        writer.write("HTTP/1.1 {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n".format(status, content_type, len(data)).encode())
        writer.write(data)
        await writer.drain()
    finally:
        writer.close()
        await writer.wait_closed()


async def sensor_task():
    # The DHT11 can be read at most every 2 seconds, so it is read only here and the page gets the latest result
    global latest
    while True:
        try:
            sensor.measure()
            latest = {"temp": sensor.temperature(), "hum": sensor.humidity()}
            print("Temperature", latest["temp"], "°C, humidity", latest["hum"], "%")
        except OSError:
            latest = {"error": True}
            print("Could not read the sensor. Check the wiring")
        await asyncio.sleep(2)


async def main():
    ip = connect_wifi()
    await asyncio.start_server(handle_client, "0.0.0.0", 80)
    print("Web server started, IP address:", ip)
    await sensor_task()


asyncio.run(main())
