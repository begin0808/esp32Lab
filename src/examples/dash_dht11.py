# 範例 28｜DHT11 溫濕度儀表板：手機上看溫度儀表、濕度數字和溫度變化圖
# 接線：DHT11 VCC 接 3V3、GND 接 GND、DATA 接 GPIO 4
# 用法：上傳後，用手機掃描監控窗旁邊的 QR code 打開手機儀表板。Wi-Fi 必須能上網
# 試試看：對感測器哈氣，看濕度和溫度變化圖怎麼動
import time
import dash
import dht
from machine import Pin

# 請改成你的 Wi-Fi 名稱與密碼（ESP32 僅支援 2.4GHz）
SSID = "YOUR_WIFI_SSID"
PASSWORD = "YOUR_WIFI_PASSWORD"

DHT_PIN = 4
HOT = 30  # 超過這個溫度，就在手機上顯示提醒

# MQTT 主題名稱，每塊板子請用不同的名稱。手機儀表板要輸入一樣的名稱
TOPIC_NAME = "{{CHANNEL}}"

sensor = dht.DHT11(Pin(DHT_PIN))

board = dash.Dashboard(TOPIC_NAME, SSID, PASSWORD)
temp_gauge = board.gauge("溫度", min=0, max=50, unit="°C")  # 半圓形儀表
humidity = board.value("濕度", unit="%")  # 大字數字
history = board.chart("溫度變化", unit="°C")  # 折線圖，保留最近 60 筆
note = board.text("狀態")  # 一行文字
board.start()

last_read = time.ticks_ms() - 2000
while True:
    board.check()
    # DHT11 不能讀太快，所以每 2 秒才讀一次；其他時間 board.check() 照樣在跑
    if time.ticks_diff(time.ticks_ms(), last_read) >= 2000:
        last_read = time.ticks_ms()
        try:
            sensor.measure()
            temp = sensor.temperature()
            temp_gauge.set(temp)
            history.set(temp)
            humidity.set(sensor.humidity())
            note.set("太熱了，注意通風" if temp > HOT else "溫度正常")
            print("溫度:", temp, "°C  濕度:", sensor.humidity(), "%")
        except OSError:  # 接線有問題時會跑到這裡
            note.set("讀取失敗，請檢查接線")
            print("讀取失敗，請檢查接線")
    time.sleep_ms(20)
