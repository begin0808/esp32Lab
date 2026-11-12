# 範例 34｜按鈕門鈴通知手機：按下板子上的按鈕，手機跳出提醒；在手機按「回應」，板子的 LED 閃 3 秒
# 接線：和範例 2 一樣，按鈕一腳接 GPIO 19、另一腳接 GND；LED 經 220Ω 電阻接 GPIO 18，短腳接 GND
# 用法：上傳後，用手機掃描監控窗旁邊的 QR code 打開手機儀表板，先按一下「開啟提醒聲音」。Wi-Fi 必須能上網
import time
import dash
from machine import Pin

# 請改成你的 Wi-Fi 名稱與密碼（ESP32 僅支援 2.4GHz）
SSID = "YOUR_WIFI_SSID"
PASSWORD = "YOUR_WIFI_PASSWORD"

LED_PIN = 18
BUTTON_PIN = 19

# MQTT 主題名稱，每塊板子請用不同的名稱。手機儀表板要輸入一樣的名稱
TOPIC_NAME = "{{CHANNEL}}"

led = Pin(LED_PIN, Pin.OUT, value=0)
button = Pin(BUTTON_PIN, Pin.IN, Pin.PULL_UP)

board = dash.Dashboard(TOPIC_NAME, SSID, PASSWORD)
bell = board.alert("門鈴")  # 板子 → 手機：跳出提醒
count = board.value("今天按了幾次", unit="次")  # 板子 → 手機：數字
answer = board.button("回應：馬上來")  # 手機 → 板子：按鈕
board.start()

rings = 0
last = button.value()
blink_until = time.ticks_ms()  # LED 閃到什麼時候
while True:
    board.check()
    now = button.value()
    if last == 1 and now == 0:  # 剛按下去
        rings += 1
        bell.send("有人按門鈴！（第 {} 次）".format(rings))
        count.set(rings)
        print("叮咚！第 {} 次".format(rings))
    last = now

    if answer.pressed():  # 手機上按了「回應」
        blink_until = time.ticks_add(time.ticks_ms(), 3000)
        print("手機回應：馬上來")
    if time.ticks_diff(blink_until, time.ticks_ms()) > 0:
        led.value(time.ticks_ms() // 200 % 2)  # 每 0.2 秒切換一次
    else:
        led.value(0)
    time.sleep_ms(20)
