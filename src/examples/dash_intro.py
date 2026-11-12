# 範例 27｜手機儀表板入門：手機上的開關控制 LED，也看得到按鈕有沒有按下
# 接線：和範例 2 一樣，按鈕一腳接 GPIO 19、另一腳接 GND；LED 經 220Ω 電阻接 GPIO 18，短腳接 GND
# 用法：上傳後，用手機掃描監控窗旁邊的 QR code，就會打開手機儀表板。Wi-Fi 必須能上網
# 網站會自動把儀表板工具 dash.py 存到板子上，畫面上有哪些元件，由下面的程式決定
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
light = board.switch("LED 開關")  # 手機 → 板子：開關
pressed = board.led("按鈕狀態")  # 板子 → 手機：指示燈
count = board.value("按了幾下", unit="下")  # 板子 → 手機：數字
board.start()  # 連上 Wi-Fi 和 MQTT，並印出手機儀表板的網址

presses = 0
last = button.value()
while True:
    board.check()  # 收手機傳來的操作、把新的值送出去，斷線時會自動重連
    led.value(light.value)  # 開關的狀態用 .value 讀：True 是開，False 是關

    now = button.value()
    pressed.set(now == 0)  # 用 .set() 把值送到手機，按下時讀到 0
    if last == 1 and now == 0:  # 剛按下去
        presses += 1
        count.set(presses)
    last = now
    time.sleep_ms(20)
