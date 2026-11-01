# 範例 2｜按鈕開關 LED：每按一次，LED 切換亮或暗
# 接線：按鈕一腳接 GPIO 19、另一腳接 GND；LED 經 220Ω 電阻接 GPIO 18，短腳接 GND
from machine import Pin
import time

LED_PIN = 18
BUTTON_PIN = 19

led = Pin(LED_PIN, Pin.OUT, value=0)  # 輸出腳位，一開始是暗的
# 使用內部上拉電阻：沒按時讀到 1，按下時讀到 0
button = Pin(BUTTON_PIN, Pin.IN, Pin.PULL_UP)

last = button.value()  # 記住上一次讀到的按鈕狀態

while True:
    now = button.value()  # 讀取按鈕現在的狀態
    if last == 1 and now == 0:  # 從 1 變 0，代表剛按下去
        led.value(not led.value())  # 切換亮暗
        print("LED:", "亮" if led.value() else "暗")
    last = now  # 存起來，下一輪才能比較
    # 等一下再讀，避開按鈕接觸瞬間的彈跳
    time.sleep_ms(30)
