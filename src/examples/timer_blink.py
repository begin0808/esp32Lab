# 範例 23｜計時器（Timer）：計時器讓 LED 每 0.5 秒自己閃一次，主程式同時做別的事
# 接線：和範例 2 一樣，LED 經 220Ω 電阻接 GPIO 18，短腳接 GND
# 比較：範例 1 用 time.sleep 等待，等待時什麼都不能做；計時器在背景計時，主程式不用停下來
from machine import Pin, Timer
import time

LED_PIN = 18

led = Pin(LED_PIN, Pin.OUT, value=0)


def toggle(timer):  # 計時器時間到，就會執行這個函式
    led.value(not led.value())


blinker = Timer(0)  # 使用 0 號硬體計時器
blinker.init(period=500, mode=Timer.PERIODIC, callback=toggle)  # 每 500 毫秒執行一次 toggle

count = 0
try:
    while True:
        count += 1
        print("主程式數到", count, "，LED 照樣自己閃")
        time.sleep(1.5)  # 主程式用不同的節奏做事，LED 的節奏不受影響
finally:  # 按「停止」時也會執行這裡
    blinker.deinit()  # 關掉計時器，不然程式停止後 LED 還會一直閃
    led.off()
