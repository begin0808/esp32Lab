# 範例 7｜光敏電阻自動夜燈：環境變暗時 LED 自動點亮
# 接線：光敏電阻一腳接 3V3、另一腳接 GPIO 34，GPIO 34 再經 10kΩ 電阻接 GND
#       LED 經 220Ω 電阻接 GPIO 18，短腳接 GND
# 光線越亮，讀值越大。先看監控窗的數字，再調整 DARK_LEVEL
from machine import ADC, Pin
import time

SENSOR_PIN = 34
LED_PIN = 18
DARK_LEVEL = 15000

sensor = ADC(Pin(SENSOR_PIN), atten=ADC.ATTN_11DB)  # 類比輸入，可量到約 3.3V
led = Pin(LED_PIN, Pin.OUT, value=0)  # 一開始先關燈

while True:
    level = sensor.read_u16()  # 讀亮度，範圍 0 到 65535
    led.value(level < DARK_LEVEL)  # 比門檻暗就開燈，否則關燈
    print("亮度:", level, "LED:", "亮" if led.value() else "暗")
    time.sleep_ms(500)
