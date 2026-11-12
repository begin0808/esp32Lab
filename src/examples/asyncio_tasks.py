# 範例 26｜asyncio（非同步輸入輸出）同時做三件事：LED 閃爍、監看按鈕、每 2 秒報告執行時間
# 接線：和範例 2 一樣，按鈕一腳接 GPIO 19、另一腳接 GND；LED 經 220Ω 電阻接 GPIO 18，短腳接 GND
# 重點：每件事寫成一個 async 函式，等待時用 await asyncio.sleep 把時間讓給別的事
# 如果改用 time.sleep，整塊板子都會停下來等，其他事也跟著停
import asyncio
import time
from machine import Pin

LED_PIN = 18
BUTTON_PIN = 19

led = Pin(LED_PIN, Pin.OUT, value=0)
button = Pin(BUTTON_PIN, Pin.IN, Pin.PULL_UP)
blink_ms = 500  # LED 閃爍的間隔，按按鈕會在快慢之間切換


async def blink():  # 第一件事：LED 一直閃
    while True:
        led.value(not led.value())
        await asyncio.sleep_ms(blink_ms)


async def watch_button():  # 第二件事：每按一次，切換快閃和慢閃
    global blink_ms
    last = button.value()
    while True:
        now = button.value()
        if last == 1 and now == 0:
            blink_ms = 100 if blink_ms == 500 else 500
            print("按鈕按下，LED 改成", "快閃" if blink_ms == 100 else "慢閃")
        last = now
        await asyncio.sleep_ms(30)


async def report():  # 第三件事：每 2 秒報告程式執行多久了
    start = time.ticks_ms()
    while True:
        await asyncio.sleep(2)
        print("已經執行", time.ticks_diff(time.ticks_ms(), start) // 1000, "秒")


async def main():
    asyncio.create_task(blink())  # 交給 asyncio 輪流執行
    asyncio.create_task(watch_button())
    await report()  # 這件事永遠不會結束，所以程式會一直跑


asyncio.run(main())
