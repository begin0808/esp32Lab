# 範例 10｜DHT11 溫濕度（不需 Wi-Fi）：每 2 秒在監控窗顯示溫度和濕度
# 接線：DHT11 VCC 接 3V3、GND 接 GND、DATA 接 GPIO 4
import dht
import time
from machine import Pin

DHT_PIN = 4

sensor = dht.DHT11(Pin(DHT_PIN))  # 建立感測器物件

while True:
    try:  # 讀取可能失敗，所以放在 try 裡
        sensor.measure()  # 要先測量，才能取得溫濕度
        print("溫度:", sensor.temperature(), "°C  濕度:", sensor.humidity(), "%")
    except OSError:  # 接線有問題時會跑到這裡
        print("讀取失敗，請檢查接線")
    time.sleep(2)  # DHT11 不能讀太快
