# 範例 37｜手機水平儀：傾斜手機，OLED 上的小球就往低的那一邊滾，放平時顯示 LEVEL!
# 接線：VCC 接 3V3、GND 接 GND、SDA 接 GPIO 21、SCL 接 GPIO 22
# 用法：上傳後，用手機掃描監控窗旁邊的 QR code 打開手機儀表板，按「開始傾斜控制」。Wi-Fi 必須能上網
# iPhone 會先詢問能不能使用動作感測器，請選「允許」。下面的 SSD1306 類別和範例 13 一樣
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
TOP = 10  # 最上面 10 點寫字，下面是小球滾動的範圍
CENTER_X = WIDTH // 2
CENTER_Y = (TOP + HEIGHT - 1) // 2
REACH_X = CENTER_X - 5  # 傾斜到最大時，小球離中心多遠
REACH_Y = CENTER_Y - TOP - 4
LEVEL = 5  # 左右和前後都在 -5～5 之間就算水平

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


def draw(x, y, on):  # 畫出外框、中心十字和小球
    oled.fill(0)
    oled.rect(0, TOP, WIDTH, HEIGHT - TOP, 1)
    oled.hline(CENTER_X - 8, CENTER_Y, 17, 1)
    oled.vline(CENTER_X, CENTER_Y - 8, 17, 1)
    ball_x = CENTER_X + x * REACH_X // 100  # 往右傾，小球往右滾
    ball_y = CENTER_Y - y * REACH_Y // 100  # 往前傾，小球往上滾
    oled.fill_rect(ball_x - 3, ball_y - 3, 7, 7, 1)
    if not on:
        oled.text("Press start", 0, 0)
    elif abs(x) <= LEVEL and abs(y) <= LEVEL:
        oled.text("LEVEL!", 0, 0)
    else:
        oled.text("x:{} y:{}".format(x, y), 0, 0)
    oled.show()


i2c = I2C(0, sda=Pin(SDA_PIN), scl=Pin(SCL_PIN), freq=400000)
if OLED_ADDRESS not in i2c.scan():
    raise OSError("找不到 OLED，請檢查接線。有些模組的位址是 0x3D，要修改 OLED_ADDRESS")
oled = SSD1306(i2c, OLED_ADDRESS, WIDTH, HEIGHT)

board = dash.Dashboard(TOPIC_NAME, SSID, PASSWORD)
tilt = board.tilt("傾斜手機")  # 手機 → 板子：tilt.x 左右、tilt.y 前後，都是 -100～100
state = board.text("水平儀")  # 板子 → 手機
board.start()

last = None
while True:
    board.check()  # 手機停止傾斜控制或斷線時，tilt.x 和 tilt.y 會回到 0
    now = (tilt.x, tilt.y, tilt.on)
    if now != last:  # 有變化才重畫，OLED 才不會一直閃
        last = now
        draw(tilt.x, tilt.y, tilt.on)
        if not tilt.on:
            state.set("請在手機按「開始傾斜控制」")
        elif abs(tilt.x) <= LEVEL and abs(tilt.y) <= LEVEL:
            state.set("水平了！")
        else:
            state.set("還沒水平：左右 {}，前後 {}".format(tilt.x, tilt.y))
    time.sleep_ms(20)
