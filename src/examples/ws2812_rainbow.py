# WS2812 全彩 LED 彩虹：顏色沿著燈條流動
# 接線：VCC 接 5V（VIN）、GND 接 GND、DIN 接 GPIO 16
# 燈數超過約 8 顆時請改用外部 5V 電源，外部電源的 GND 要和 ESP32 接在一起
from machine import Pin
from neopixel import NeoPixel
import time

LED_PIN = 16
LED_COUNT = 8
# 亮度 0 到 255。全亮很刺眼也很耗電，上課用低亮度就夠了
BRIGHTNESS = 40

strip = NeoPixel(Pin(LED_PIN), LED_COUNT)


def wheel(position):
    position %= 256
    if position < 85:
        red, green, blue = 255 - position * 3, position * 3, 0
    elif position < 170:
        position -= 85
        red, green, blue = 0, 255 - position * 3, position * 3
    else:
        position -= 170
        red, green, blue = position * 3, 0, 255 - position * 3
    return (red * BRIGHTNESS // 255, green * BRIGHTNESS // 255, blue * BRIGHTNESS // 255)


offset = 0

while True:
    for index in range(LED_COUNT):
        strip[index] = wheel(offset + index * 256 // LED_COUNT)
    strip.write()
    offset = (offset + 4) % 256
    time.sleep_ms(40)
