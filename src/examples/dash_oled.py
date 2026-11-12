# 範例 33｜手機傳文字到 OLED：在手機輸入英文，OLED 顯示器就顯示出來
# 接線：VCC 接 3V3、GND 接 GND、SDA 接 GPIO 21、SCL 接 GPIO 22
# 用法：上傳後，用手機掃描監控窗旁邊的 QR code 打開手機儀表板。Wi-Fi 必須能上網
# 內建字型只有英文、數字和符號，中文會顯示成「?」。下面的 SSD1306 類別和範例 13 一樣
import time
import dash
import framebuf
from machine import I2C, Pin

# 請改成你的 Wi-Fi 名稱與密碼（ESP32 僅支援 2.4GHz）
SSID = "YOUR_WIFI_SSID"
PASSWORD = "YOUR_WIFI_PASSWORD"

SDA_PIN = 21
SCL_PIN = 22
WIDTH = 128
HEIGHT = 64
OLED_ADDRESS = 0x3C
COLUMNS = WIDTH // 8  # 每個字 8 點寬，一行 16 個字
ROWS = HEIGHT // 10  # 每行 10 點高，最多 6 行

# MQTT 主題名稱，每塊板子請用不同的名稱。手機儀表板要輸入一樣的名稱
TOPIC_NAME = "{{CHANNEL}}"


class SSD1306(framebuf.FrameBuffer):  # 繼承 FrameBuffer，就能使用畫線和寫字的功能
    def __init__(self, i2c, address, width, height):
        self.i2c = i2c
        self.address = address
        self.width = width
        self.pages = height // 8
        # 畫面先存在記憶體，show() 時才送出
        self.buffer = bytearray(self.pages * width)
        super().__init__(self.buffer, width, height, framebuf.MONO_VLSB)
        for command in (  # 依序送出初始化指令
            0xAE,              # 關閉顯示
            0xD5, 0x80,        # 時脈
            0xA8, height - 1,  # 多工比
            0xD3, 0x00,        # 顯示位移
            0x40,              # 起始行
            0x8D, 0x14,        # 開啟內部升壓電路
            0x20, 0x00,        # 水平定址模式
            0xA1,              # 左右方向
            0xC8,              # 上下方向
            0xDA, 0x12 if height == 64 else 0x02,  # COM 腳位配置
            0x81, 0xCF,        # 對比
            0xD9, 0xF1,        # 預充電
            0xDB, 0x40,        # VCOM 電壓
            0xA4,              # 顯示記憶體內容
            0xA6,              # 正常顯示（非反白）
            0xAF,              # 開啟顯示
        ):
            self.write_command(command)
        self.fill(0)
        self.show()

    def write_command(self, command):  # 送一個指令給顯示器
        self.i2c.writeto(self.address, bytes((0x00, command)))

    def show(self):  # 把記憶體裡的畫面送到顯示器
        for command in (0x21, 0, self.width - 1, 0x22, 0, self.pages - 1):
            self.write_command(command)
        self.i2c.writeto(self.address, b"\x40" + self.buffer)


def show_message(text):  # 把文字切成一行 16 個字，顯示在 OLED 上
    # 內建字型沒有中文，看不懂的字換成 ?
    text = "".join(char if 32 <= ord(char) < 127 else "?" for char in text)
    oled.fill(0)
    for row in range(ROWS):
        oled.text(text[row * COLUMNS:(row + 1) * COLUMNS], 0, row * 10)
    oled.show()


i2c = I2C(0, sda=Pin(SDA_PIN), scl=Pin(SCL_PIN), freq=400000)
if OLED_ADDRESS not in i2c.scan():
    raise OSError("找不到 OLED，請檢查接線。有些模組的位址是 0x3D，要修改 OLED_ADDRESS")
oled = SSD1306(i2c, OLED_ADDRESS, WIDTH, HEIGHT)
show_message("Waiting for the phone...")

board = dash.Dashboard(TOPIC_NAME, SSID, PASSWORD)
message = board.input("要顯示的文字")  # 手機 → 板子：文字輸入
clear = board.button("清除畫面")  # 手機 → 板子：按鈕
board.start()

while True:
    board.check()
    if message.changed():  # 手機傳來新的文字
        show_message(message.value)
        print("顯示:", message.value)
    if clear.pressed():
        show_message("")
        print("清除畫面")
    time.sleep_ms(20)
