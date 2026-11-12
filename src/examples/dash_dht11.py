# 範例 28｜DHT11 溫濕度儀表板：手機上看溫度和濕度儀表、濕度變化圖，太熱時顯示提醒
# 接線：DHT11 VCC 接 3V3、GND 接 GND、DATA 接 GPIO 4
# 用法：上傳後，用手機掃描監控窗旁邊的 QR code 打開手機儀表板。Wi-Fi 必須能上網
# 試試看：對感測器哈氣，濕度會明顯上升，濕度變化圖也會跟著往上
import time
import dash
import dht
from machine import Pin

# 請改成你的 Wi-Fi 名稱與密碼（ESP32 僅支援 2.4GHz）
SSID = "YOUR_WIFI_SSID"
PASSWORD = "YOUR_WIFI_PASSWORD"

DHT_PIN = 4
HOT = 30  # 溫度超過 30°C，手機上的狀態就會顯示提醒
READ_MS = 3000  # 每 3 秒讀一次，DHT11 不能讀太快

# MQTT 主題名稱，每塊板子請用不同的名稱。手機儀表板要輸入一樣的名稱
TOPIC_NAME = "{{CHANNEL}}"

sensor = dht.DHT11(Pin(DHT_PIN))

board = dash.Dashboard(TOPIC_NAME, SSID, PASSWORD)
temp_gauge = board.gauge("溫度", min=0, max=50, unit="°C", color="red")  # 半圓形儀表，紅色
humidity_gauge = board.gauge("濕度", min=0, max=100, unit="%", color="blue")  # 半圓形儀表，藍色
history = board.chart("濕度變化", unit="%")  # 折線圖，保留最近 60 筆，下面會標時間
note = board.text("狀態（超過 {}°C 會提醒）".format(HOT))  # 一行文字，標題寫出提醒的條件
board.start()

last_read = time.ticks_ms() - READ_MS
while True:
    board.check()
    # 用時間差每 3 秒讀一次感測器；其他時間 board.check() 照樣在跑，才收得到手機的操作
    if time.ticks_diff(time.ticks_ms(), last_read) >= READ_MS:
        last_read = time.ticks_ms()
        try:
            sensor.measure()
            temp = sensor.temperature()
            humidity = sensor.humidity()
            temp_gauge.set(temp)
            humidity_gauge.set(humidity)
            history.set(humidity)
            if temp > HOT:
                note.set("太熱了：{}°C，超過 {}°C，注意通風".format(temp, HOT))
            else:
                note.set("溫度正常：{}°C，沒有超過 {}°C".format(temp, HOT))
            print("溫度:", temp, "°C  濕度:", humidity, "%")
        except OSError:  # 接線有問題時會跑到這裡
            note.set("讀取失敗，請檢查接線")
            print("讀取失敗，請檢查接線")
    time.sleep_ms(20)
