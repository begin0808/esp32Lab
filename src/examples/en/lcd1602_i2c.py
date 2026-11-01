# I2C LCD 1602 display (PCF8574 backpack): shows text and seconds since boot
# Wiring: SDA to GPIO 21, SCL to GPIO 22, GND to GND
#         Most modules need 5V (VIN). SDA and SCL may then be pulled up to 5V, so use a level shifter instead of wiring them straight to GPIO
# The firmware has no driver for this part. The LCD1602 class below is included in this file, so there is nothing else to install
# If no text appears after power-up, first adjust the contrast knob on the back of the backpack
from machine import I2C, Pin
import time

SDA_PIN = 21
SCL_PIN = 22
# The PCF8574 is usually 0x27, the PCF8574A usually 0x3F
LCD_ADDRESSES = (0x27, 0x3F)

# The LCD signal on each PCF8574 output
RS = 0x01
ENABLE = 0x04
BACKLIGHT = 0x08


class LCD1602:
    def __init__(self, i2c, address):
        self.i2c = i2c
        self.address = address
        time.sleep_ms(50)
        # Switch to 4-bit mode using the datasheet's start-up sequence
        for nibble in (0x30, 0x30, 0x30, 0x20):
            self.write_nibble(nibble, 0)
            time.sleep_ms(5)
        self.command(0x28)  # 4-bit, two lines, 5×8 font
        self.command(0x0C)  # Display on, cursor hidden
        self.command(0x06)  # Cursor moves right after each write
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
print("I2C device addresses:", [hex(address) for address in found])
address = next((a for a in LCD_ADDRESSES if a in found), None)
if address is None:
    raise OSError("LCD not found. Check the wiring and the module's power")

lcd = LCD1602(i2c, address)
lcd.write("ESP32 Lab")

while True:
    lcd.move_to(0, 1)
    lcd.write("Time: {} s".format(time.ticks_ms() // 1000))
    time.sleep(1)
