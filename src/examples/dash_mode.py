# 範例 32｜選單切換 LED 模式：在手機上選「關、亮、閃爍、呼吸燈」，LED 跟著換模式
# 接線：LED 經 220Ω 電阻接 GPIO 18，短腳接 GND
# 用法：上傳後，用手機掃描監控窗旁邊的 QR code 打開手機儀表板。Wi-Fi 必須能上網
# 重點：閃爍和呼吸燈都用時間計算亮度，不用 time.sleep 等待，board.check() 才能一直收到手機的操作
import time
import dash
from machine import Pin, PWM

# 請改成你的 Wi-Fi 名稱與密碼（ESP32 僅支援 2.4GHz）
SSID = "YOUR_WIFI_SSID"
PASSWORD = "YOUR_WIFI_PASSWORD"

LED_PIN = 18

# MQTT 主題名稱，每塊板子請用不同的名稱。手機儀表板要輸入一樣的名稱
TOPIC_NAME = "{{CHANNEL}}"

led = PWM(Pin(LED_PIN), freq=1000, duty_u16=0)

board = dash.Dashboard(TOPIC_NAME, SSID, PASSWORD)
mode = board.select("LED 模式", ["關", "亮", "閃爍", "呼吸燈"])  # 手機 → 板子：選單
level = board.gauge("目前亮度", min=0, max=100, unit="%", color="yellow")  # 板子 → 手機：儀表
board.start()

while True:
    board.check()
    now = time.ticks_ms()
    if mode.value == "關":
        brightness = 0
    elif mode.value == "亮":
        brightness = 100
    elif mode.value == "閃爍":
        brightness = 100 if now // 500 % 2 == 0 else 0  # 每 0.5 秒切換一次
    else:  # 呼吸燈：2 秒內從暗到亮再到暗
        phase = now % 2000
        brightness = phase // 10 if phase < 1000 else (2000 - phase) // 10
    led.duty_u16(brightness * 65535 // 100)
    level.set(brightness)
    time.sleep_ms(20)
