# 範例 35｜手機調整濕度門檻：濕度超過手機上設定的門檻，LED 就亮，不用改程式就能做實驗
# 接線：DHT11 VCC 接 3V3、GND 接 GND、DATA 接 GPIO 4；LED 經 220Ω 電阻接 GPIO 18，短腳接 GND
# 用法：上傳後，用手機掃描監控窗旁邊的 QR code 打開手機儀表板。Wi-Fi 必須能上網
# 試試看：把門檻設成比現在的濕度高 5%，再對感測器哈氣，看 LED 什麼時候亮
import time
import dash
import dht
from machine import Pin

# 請改成你的 Wi-Fi 名稱與密碼（ESP32 僅支援 2.4GHz）
SSID = "YOUR_WIFI_SSID"
PASSWORD = "YOUR_WIFI_PASSWORD"

DHT_PIN = 4
LED_PIN = 18
READ_MS = 3000  # 每 3 秒讀一次，DHT11 不能讀太快

# MQTT 主題名稱，每塊板子請用不同的名稱。手機儀表板要輸入一樣的名稱
TOPIC_NAME = "{{CHANNEL}}"

sensor = dht.DHT11(Pin(DHT_PIN))
led = Pin(LED_PIN, Pin.OUT, value=0)

board = dash.Dashboard(TOPIC_NAME, SSID, PASSWORD)
# 手機 → 板子：數字設定，按 − 和 ＋ 或直接輸入。伺服器會記住，板子重新開機也一樣
limit = board.number("濕度門檻", value=70, min=30, max=95, step=5, unit="%")
humidity_gauge = board.gauge("濕度", min=0, max=100, unit="%", color="blue")  # 板子 → 手機：儀表
lamp = board.led("超過門檻", color="red")  # 板子 → 手機：指示燈
board.start()

humidity = None  # 最近一次讀到的濕度，還沒讀到時是 None
last_read = time.ticks_ms() - READ_MS
while True:
    board.check()
    if limit.changed():  # 手機改了門檻
        print("新的門檻:", limit.value, "%")
    if time.ticks_diff(time.ticks_ms(), last_read) >= READ_MS:
        last_read = time.ticks_ms()
        try:
            sensor.measure()
            humidity = sensor.humidity()
            humidity_gauge.set(humidity)
            print("濕度:", humidity, "%  門檻:", limit.value, "%")
        except OSError:  # 接線有問題時會跑到這裡
            print("讀取失敗，請檢查接線")
    if humidity is not None:
        too_wet = humidity > limit.value  # 每一圈都用最新的門檻比較，手機一改馬上有反應
        led.value(too_wet)
        lamp.set(too_wet)
    time.sleep_ms(20)
