# 範例 30｜手機選顏色點亮全彩 LED：在手機色盤選顏色，WS2812 燈條跟著變色
# 接線：VCC 接 5V（VIN）、GND 接 GND、DIN 接 GPIO 16
# 用法：上傳後，用手機掃描監控窗旁邊的 QR code 打開手機儀表板。Wi-Fi 必須能上網
# 燈數超過約 8 顆時請改用外部 5V 電源，外部電源的 GND 要和 ESP32 接在一起
import time
import dash
from machine import Pin
from neopixel import NeoPixel

# 請改成你的 Wi-Fi 名稱與密碼（ESP32 僅支援 2.4GHz）
SSID = "YOUR_WIFI_SSID"
PASSWORD = "YOUR_WIFI_PASSWORD"

LED_PIN = 16
LED_COUNT = 8

# MQTT 主題名稱，每塊板子請用不同的名稱。手機儀表板要輸入一樣的名稱
TOPIC_NAME = "{{CHANNEL}}"

strip = NeoPixel(Pin(LED_PIN), LED_COUNT)

board = dash.Dashboard(TOPIC_NAME, SSID, PASSWORD)
shade = board.color("燈的顏色")  # 手機 → 板子：色盤
level = board.slider("亮度", min=0, max=100, unit="%")  # 手機 → 板子：滑桿
# 第一次用 20% 的亮度，全亮很刺眼也很耗電。之後伺服器會記住手機上最後的位置
level.set(20)
board.start()

shown = None
while True:
    board.check()
    red, green, blue = shade.value  # 色盤的值是（紅, 綠, 藍），各 0～255
    # 依亮度把三個顏色等比例調暗
    color = (red * level.value // 100, green * level.value // 100, blue * level.value // 100)
    if color != shown:  # 顏色有變才更新燈條
        strip.fill(color)
        strip.write()
        print("顏色:", color)
        shown = color
    time.sleep_ms(20)
