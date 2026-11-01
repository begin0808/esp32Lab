# 範例 3｜呼吸燈：用 PWM 讓 LED 慢慢變亮再慢慢變暗
# 接線：LED 經 220Ω 電阻接 GPIO 18，短腳接 GND
from machine import Pin, PWM
import time

LED_PIN = 18

# PWM 快速開關，每秒 1000 次，從全暗開始
led = PWM(Pin(LED_PIN), freq=1000, duty_u16=0)

while True:
    for percent in range(0, 101, 2):  # 亮度 0% 到 100%，每次加 2
        led.duty_u16(percent * 65535 // 100)  # 把百分比換算成 0 到 65535
        time.sleep_ms(20)  # 等 20 毫秒，數字越大變化越慢
    for percent in range(100, -1, -2):  # 亮度從 100% 降回 0%
        led.duty_u16(percent * 65535 // 100)
        time.sleep_ms(20)
