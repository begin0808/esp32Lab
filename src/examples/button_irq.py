# 範例 22｜按鈕中斷（IRQ）：按下的瞬間就記下來，主程式在忙也不會漏掉
# 接線：和範例 2 一樣，按鈕一腳接 GPIO 19、另一腳接 GND；LED 經 220Ω 電阻接 GPIO 18，短腳接 GND
# 比較：範例 2 要一直去讀按鈕；這裡由按鈕「通知」程式，主程式每 2 秒才回來看一次，也不會漏掉
from machine import Pin
import time

LED_PIN = 18
BUTTON_PIN = 19

led = Pin(LED_PIN, Pin.OUT, value=0)
button = Pin(BUTTON_PIN, Pin.IN, Pin.PULL_UP)  # 沒按時讀到 1，按下時讀到 0

presses = 0  # 總共按了幾下
last_press = 0  # 上一次算進去的時間（毫秒）


def on_press(pin):  # 中斷處理函式：按鈕一按下，板子就暫停手上的事來執行它
    global presses, last_press
    now = time.ticks_ms()
    # 按鈕接觸的瞬間會彈跳好幾次，200 毫秒內的重複觸發不算
    if time.ticks_diff(now, last_press) > 200:
        presses += 1
        last_press = now
        led.value(not led.value())  # 中斷處理函式要短：只記錄和切換 LED，不要 sleep 或做很久的事


# 按下時電壓從 1 掉到 0，叫做「下降邊緣」（IRQ_FALLING）
button.irq(trigger=Pin.IRQ_FALLING, handler=on_press)

shown = 0  # 已經顯示過的次數
try:
    while True:
        time.sleep(2)  # 假裝主程式在忙，2 秒才回來看一次
        if presses != shown:
            print("這 2 秒按了", presses - shown, "下，總共", presses, "下")
            shown = presses
finally:  # 按「停止」時也會執行這裡
    button.irq(handler=None)  # 取消中斷，不然程式停止後，按按鈕 LED 還會切換
