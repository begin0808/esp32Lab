# LED 閃爍：板載藍色 LED 接在 GPIO 2，每秒切換一次
# 外接 LED 時，把 LED_PIN 改成接線的腳位（例如 18）
from machine import Pin
import time

LED_PIN = 2

led = Pin(LED_PIN, Pin.OUT)

while True:
    led.value(not led.value())
    print("LED:", "亮" if led.value() else "暗")
    time.sleep(1)
