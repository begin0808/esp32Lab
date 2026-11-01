# 範例 1｜LED 閃爍：每秒切換一次
# 接線：ESP32-S 開發板的板載藍色 LED 通常在 GPIO 2，不用另外接線
# 外接 LED 時，把 LED_PIN 改成接線的腳位（例如 GPIO 18）
from machine import Pin  # Pin 用來控制腳位
import time  # time 用來暫停

LED_PIN = 2  # LED 接的腳位

led = Pin(LED_PIN, Pin.OUT)  # 設成輸出腳位，才能控制亮暗

while True:  # 一直重複下面的內容
    led.value(not led.value())  # 讀目前的狀態，再改成相反
    print("LED:", "亮" if led.value() else "暗")
    time.sleep(1)  # 暫停 1 秒
