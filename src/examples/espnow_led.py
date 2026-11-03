# 範例 25｜ESP-NOW 多塊板子互傳：按任一塊板子的按鈕，所有板子的 LED 一起切換
# 接線：每塊板子都和範例 2 一樣，按鈕一腳接 GPIO 19、另一腳接 GND；LED 經 220Ω 電阻接 GPIO 18，短腳接 GND
# 用法：兩塊以上的板子都上傳這份程式。板子之間直接傳訊息，不用 Wi-Fi 帳密，也不用輸入對方的位址
import espnow
import network
import time
from machine import Pin

LED_PIN = 18
BUTTON_PIN = 19
BROADCAST = b"\xff" * 6  # 廣播位址：附近所有板子都收得到

led = Pin(LED_PIN, Pin.OUT, value=0)
button = Pin(BUTTON_PIN, Pin.IN, Pin.PULL_UP)

wlan = network.WLAN(network.STA_IF)  # ESP-NOW 要用 Wi-Fi 晶片收發，但不用連上任何網路
wlan.active(True)
wlan.disconnect()  # 板子以前連過的 Wi-Fi 會改變頻道，先斷開
wlan.config(channel=1)  # 大家都用 1 號頻道，才收得到彼此

esp = espnow.ESPNow()
esp.active(True)
esp.add_peer(BROADCAST)


def mac_text(mac):  # 把位址變成 A4:CF:12:34:56:78 這種寫法
    return ":".join("{:02X}".format(b) for b in mac)


def show(state):
    led.value(state)
    print("LED", "亮" if state else "暗")


print("我的 MAC 位址：", mac_text(wlan.config("mac")))
print("按按鈕，所有板子的 LED 會一起切換")

last = button.value()
while True:
    now = button.value()
    if last == 1 and now == 0:  # 剛按下去
        state = 0 if led.value() else 1
        esp.send(BROADCAST, b"on" if state else b"off")  # 告訴其他板子新的狀態
        show(state)
    last = now

    sender, message = esp.recv(0)  # 0 表示不等待；沒有訊息時兩個都是 None
    if message:
        print("收到", mac_text(sender), "的訊息：", message.decode())
        show(1 if message == b"on" else 0)
    time.sleep_ms(30)
