# 可變電阻調整 LED 亮度：轉動旋鈕，LED 跟著變亮或變暗
# 接線：可變電阻兩端接 3V3 和 GND，中間腳接 GPIO 34
#       LED 經 220Ω 電阻接 GPIO 18，短腳接 GND
from machine import ADC, Pin, PWM
import time

KNOB_PIN = 34
LED_PIN = 18

knob = ADC(Pin(KNOB_PIN), atten=ADC.ATTN_11DB)
led = PWM(Pin(LED_PIN), freq=1000, duty_u16=0)

while True:
    value = knob.read_u16()
    led.duty_u16(value)
    print("旋鈕:", value * 100 // 65535, "%")
    time.sleep_ms(200)
