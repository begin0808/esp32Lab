# 範例 13｜SSD1306 OLED 顯示器（128×64，I2C）：顯示文字和開機秒數
# 接線：VCC 接 3V3、GND 接 GND、SDA 接 GPIO 21、SCL 接 GPIO 22
# 韌體沒有內建這個元件的控制程式，下面的 SSD1306 類別已經寫在這個檔案裡，不用另外安裝
# 內建字型只有英文、數字和符號，不能顯示中文
from machine import I2C, Pin
import framebuf
import time

SDA_PIN = 21
SCL_PIN = 22
WIDTH = 128
HEIGHT = 64
OLED_ADDRESS = 0x3C


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


# I2C 只要 SDA、SCL 兩條線
i2c = I2C(0, sda=Pin(SDA_PIN), scl=Pin(SCL_PIN), freq=400000)
found = i2c.scan()  # 掃描接在 I2C 上的裝置
print("I2C 裝置位址:", [hex(address) for address in found])
if OLED_ADDRESS not in found:
    raise OSError("找不到 OLED，請檢查接線。有些模組的位址是 0x3D，要修改 OLED_ADDRESS")

oled = SSD1306(i2c, OLED_ADDRESS, WIDTH, HEIGHT)

while True:
    oled.fill(0)  # 先清空畫面
    oled.text("ESP32 Lab", 0, 0)  # 文字、X 座標、Y 座標
    oled.hline(0, 12, WIDTH, 1)  # 畫一條橫線
    oled.text("Hello OLED!", 0, 24)
    oled.text("Time: {} s".format(time.ticks_ms() // 1000), 0, 44)
    oled.show()  # 畫完才顯示
    time.sleep(1)
