# Phone-controlled LED: web page buttons and voice control (on, off, blink)
# Wiring: LED long leg to GPIO 18, short leg through a 220Ω resistor to GND
import asyncio
import network
import time
from machine import Pin

# Change these to your Wi-Fi name and password (ESP32 only supports 2.4GHz)
SSID = "YOUR_WIFI_SSID"
PASSWORD = "YOUR_WIFI_PASSWORD"

LED_PIN = 18

led = Pin(LED_PIN, Pin.OUT, value=0)
mode = "off"

PAGE = """<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ESP32 LED Control</title>
<style>
body{font-family:Arial,sans-serif;text-align:center;background:#f0f2f5;padding:20px}
button{display:block;width:80%;max-width:300px;margin:15px auto;padding:15px;font-size:20px;color:#fff;border:0;border-radius:12px}
input{display:block;box-sizing:border-box;width:80%;max-width:300px;margin:15px auto;padding:15px;font-size:20px;border:1px solid #888;border-radius:12px}
.on{background:#28a745}.off{background:#dc3545}.blink{background:#ffc107;color:#000}.voice{background:#007bff}
</style></head><body>
<h2>ESP32 LED Control</h2>
<button class="voice" onclick="startVoice()">🎤 Voice control</button>
<button class="on" onclick="send('on')">On</button>
<button class="off" onclick="send('off')">Off</button>
<button class="blink" onclick="send('blink')">Blink</button>
<form onsubmit="event.preventDefault();runCommand(this.command.value);this.command.value=''">
<input name="command" placeholder="Type: on, off or blink" autocomplete="off">
<button class="voice">Send text command</button>
</form>
<p id="status">Ready</p>
<script>
function show(text){document.getElementById('status').innerText=text}
function send(cmd){fetch('/'+cmd).then(()=>show('Current mode: '+cmd)).catch(()=>show('Connection failed'))}
function runCommand(t){
  const w=t.toLowerCase().replace(/[^a-z ]/g,'').split(' ');
  if(w.includes('blink')||w.includes('flash'))send('blink');
  else if(w.includes('off')||w.includes('dark'))send('off');
  else if(w.includes('on')||w.includes('bright'))send('on');
  else show('Did not understand "'+t+'". Please say on, off or blink');
}
function startVoice(){
  const Rec=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Rec){show('This browser has no speech recognition. Please use text commands');return}
  const rec=new Rec();
  rec.lang='en-US';
  rec.onresult=e=>{
    const t=e.results[0][0].transcript;
    show('Heard: '+t);
    runCommand(t);
  };
  rec.onerror=e=>{
    if(e.error==='not-allowed'||e.error==='service-not-allowed')show('The browser does not allow the microphone on this address. Type a command in the text box instead (on Windows, Win+H starts voice typing)');
    else if(e.error==='network')show('Speech recognition needs the internet. Check that the phone is online');
    else show('Speech recognition failed, please try again ('+e.error+')');
  };
  show('Listening...');
  rec.start();
}
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
    global mode
    try:
        request = await reader.readline()
        while True:
            header = await reader.readline()
            if not header or header == b"\r\n":
                break
        parts = request.split()
        path = parts[1].decode() if len(parts) > 1 else "/"

        if path in ("/on", "/off", "/blink"):
            mode = path[1:]
            if mode != "blink":
                led.value(1 if mode == "on" else 0)
            status, content_type, body = "200 OK", "text/plain", mode
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


async def blink_task():
    while True:
        if mode == "blink":
            led.value(not led.value())
        await asyncio.sleep(0.5)


async def main():
    ip = connect_wifi()
    await asyncio.start_server(handle_client, "0.0.0.0", 80)
    print("Web server started, IP address:", ip)
    await blink_task()


asyncio.run(main())
