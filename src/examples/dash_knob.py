# 範例 29｜旋鈕和手機滑桿一起調 LED 亮度：轉可變電阻或拉手機的滑桿都能調亮度，誰最後動就聽誰的
# 接線：可變電阻兩端接 3V3 和 GND，中間腳接 GPIO 34
#       LED 經 220Ω 電阻接 GPIO 18，短腳接 GND
# 用法：上傳後，用手機掃描監控窗旁邊的 QR code 打開手機儀表板。Wi-Fi 必須能上網
import time
import dash
from machine import ADC, Pin, PWM

# 請改成你的 Wi-Fi 名稱與密碼（ESP32 僅支援 2.4GHz）
SSID = "YOUR_WIFI_SSID"
PASSWORD = "YOUR_WIFI_PASSWORD"

KNOB_PIN = 34
LED_PIN = 18

# MQTT 主題名稱，每塊板子請用不同的名稱。手機儀表板要輸入一樣的名稱
TOPIC_NAME = "{{CHANNEL}}"
KNOB_STEP = 3  # 旋鈕至少轉動 3% 才算有轉，數值小小的跳動不會蓋掉手機的設定

knob = ADC(Pin(KNOB_PIN), atten=ADC.ATTN_11DB)  # 類比輸入，可量到約 3.3V
led = PWM(Pin(LED_PIN), freq=1000, duty_u16=0)  # 用 PWM 調整亮度


def read_knob():  # 旋鈕位置換算成 0～100%
    return knob.read_u16() * 100 // 65535


board = dash.Dashboard(TOPIC_NAME, SSID, PASSWORD)
brightness = board.slider("LED 亮度", min=0, max=100, unit="%")  # 手機 → 板子：滑桿
knob_gauge = board.gauge("旋鈕位置", min=0, max=100, unit="%")  # 板子 → 手機：儀表
full = board.button("全亮")  # 手機 → 板子：按一下
board.start()

last_knob = read_knob()  # 開機時不改亮度，等旋鈕真的轉了才用它
last_read = time.ticks_ms()
while True:
    board.check()
    if full.pressed():  # 手機上按了「全亮」
        brightness.set(100)  # 板子也能改滑桿的位置，手機上的滑桿會跟著動
    led.duty_u16(brightness.value * 65535 // 100)  # 0～100% 換算成 PWM 的 0～65535

    if time.ticks_diff(time.ticks_ms(), last_read) >= 200:  # 每 0.2 秒讀一次旋鈕
        last_read = time.ticks_ms()
        percent = read_knob()
        knob_gauge.set(percent)
        moved = abs(percent - last_knob) >= KNOB_STEP  # 旋鈕轉動了
        if moved or (percent != last_knob and percent in (0, 100)):  # 轉到底時就算不到 3% 也要到 0 或 100
            last_knob = percent
            brightness.set(percent)  # 把手機的滑桿移到旋鈕的位置，LED 也跟著變
    time.sleep_ms(20)
