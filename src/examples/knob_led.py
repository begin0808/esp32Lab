# 範例 4｜可變電阻調整 LED 亮度：轉動旋鈕，LED 跟著變亮或變暗
# 接線：可變電阻兩端接 3V3 和 GND，中間腳接 GPIO 34
#       LED 經 220Ω 電阻接 GPIO 18，短腳接 GND
from machine import ADC, Pin, PWM
import time

KNOB_PIN = 34
LED_PIN = 18

knob = ADC(Pin(KNOB_PIN), atten=ADC.ATTN_11DB)  # 類比輸入，可量到約 3.3V
led = PWM(Pin(LED_PIN), freq=1000, duty_u16=0)  # 用 PWM 調整亮度

while True:
    value = knob.read_u16()  # 讀旋鈕位置，範圍 0 到 65535
    led.duty_u16(value)  # PWM 範圍相同，可以直接使用
    print("旋鈕:", value * 100 // 65535, "%")  # 換算成百分比顯示
    time.sleep_ms(200)  # 每 0.2 秒更新一次
