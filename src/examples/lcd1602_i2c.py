# I2C LCD 1602 顯示器（PCF8574 轉接板）：顯示文字和開機秒數
# 接線：SDA 接 GPIO 21、SCL 接 GPIO 22、GND 接 GND
#       模組多半要接 5V（VIN）。此時 SDA、SCL 可能被拉高到 5V，要加電平轉換模組，不要直接接 GPIO
# 韌體沒有內建這個元件的控制程式，下面的 LCD1602 類別已經寫在這個檔案裡，不用另外安裝
# 通電後看不到字時，先調整轉接板背面的旋鈕（對比）
from machine import I2C, Pin
import time

SDA_PIN = 21
SCL_PIN = 22
# PCF8574 常見 0x27，PCF8574A 常見 0x3F
LCD_ADDRESSES = (0x27, 0x3F)

# PCF8574 各輸出腳對應的 LCD 訊號
RS = 0x01
ENABLE = 0x04
BACKLIGHT = 0x08


class LCD1602:
    def __init__(self, i2c, address):
        self.i2c = i2c
        self.address = address
        time.sleep_ms(50)
        # 依規格書的初始化順序切換到 4 位元模式
        for nibble in (0x30, 0x30, 0x30, 0x20):
            self.write_nibble(nibble, 0)
            time.sleep_ms(5)
        self.command(0x28)  # 4 位元、兩行、5×8 字型
        self.command(0x0C)  # 開啟顯示、不顯示游標
        self.command(0x06)  # 寫入後游標往右
        self.clear()

    def write_nibble(self, nibble, mode):
        data = nibble | mode | BACKLIGHT
        self.i2c.writeto(self.address, bytes((data | ENABLE, data)))
        time.sleep_us(50)

    def send(self, value, mode):
        self.write_nibble(value & 0xF0, mode)
        self.write_nibble((value << 4) & 0xF0, mode)

    def command(self, value):
        self.send(value, 0)

    def clear(self):
        self.command(0x01)
        time.sleep_ms(2)

    def move_to(self, column, row):
        self.command(0x80 | (0x40 * row + column))

    def write(self, text):
        for char in text:
            self.send(ord(char), RS)


i2c = I2C(0, sda=Pin(SDA_PIN), scl=Pin(SCL_PIN), freq=100000)
found = i2c.scan()
print("I2C 裝置位址:", [hex(address) for address in found])
address = next((a for a in LCD_ADDRESSES if a in found), None)
if address is None:
    raise OSError("找不到 LCD，請檢查接線和模組電源")

lcd = LCD1602(i2c, address)
lcd.write("ESP32 Lab")

while True:
    lcd.move_to(0, 1)
    lcd.write("Time: {} s".format(time.ticks_ms() // 1000))
    time.sleep(1)
