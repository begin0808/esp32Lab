# 範例 36｜溫濕度紀錄表：每隔一段時間把溫度和濕度記成一列，最後在手機下載 CSV
# 接線：DHT11 VCC 接 3V3、GND 接 GND、DATA 接 GPIO 4
# 用法：上傳後，用手機掃描監控窗旁邊的 QR code 打開手機儀表板。Wi-Fi 必須能上網
# 紀錄存在手機頁上，手機頁打開以後才收得到；重新整理或關掉就會清空，記得先按「下載 CSV」
# 試試看：按「現在記一筆」，對感測器哈氣後再按一次，比較兩列的濕度
import time
import dash
import dht
from machine import Pin

# 請改成你的 Wi-Fi 名稱與密碼（ESP32 僅支援 2.4GHz）
SSID = "YOUR_WIFI_SSID"
PASSWORD = "YOUR_WIFI_PASSWORD"

DHT_PIN = 4

# MQTT 主題名稱，每塊板子請用不同的名稱。手機儀表板要輸入一樣的名稱
TOPIC_NAME = "{{CHANNEL}}"

sensor = dht.DHT11(Pin(DHT_PIN))

board = dash.Dashboard(TOPIC_NAME, SSID, PASSWORD)
table = board.log("溫濕度紀錄", ["溫度 (°C)", "濕度 (%)"])  # 板子 → 手機：紀錄表，時間由手機加上
every = board.number("記錄間隔", value=10, min=5, max=60, step=5, unit="秒")  # 手機 → 板子：數字設定
now_button = board.button("現在記一筆")  # 手機 → 板子：按鈕
board.start()


def record():  # 讀一次感測器，在紀錄表新增一列
    try:
        sensor.measure()
        temp = sensor.temperature()
        humidity = sensor.humidity()
    except OSError:  # 接線有問題，或讀得太快時會跑到這裡
        print("讀取失敗，請檢查接線")
        return
    table.add(temp, humidity)  # 值的順序要和欄位一樣
    print("記錄: 溫度", temp, "°C  濕度", humidity, "%")


last_record = time.ticks_ms()
while True:
    board.check()
    # 時間到了，或手機按了「現在記一筆」，就記一列
    if now_button.pressed() or time.ticks_diff(time.ticks_ms(), last_record) >= every.value * 1000:
        last_record = time.ticks_ms()
        record()
    time.sleep_ms(20)
