# Example 13 | SSD1306 OLED display (128×64, I2C): shows text and seconds since boot
# Wiring: VCC to 3V3, GND to GND, SDA to GPIO 21, SCL to GPIO 22
# The firmware has no driver for this part. The SSD1306 class below is included in this file, so there is nothing else to install
# The built-in font has only English letters, digits and symbols
from machine import I2C, Pin
import framebuf
import time

SDA_PIN = 21
SCL_PIN = 22
WIDTH = 128
HEIGHT = 64
OLED_ADDRESS = 0x3C


# FrameBuffer provides the drawing and text functions
class SSD1306(framebuf.FrameBuffer):
    def __init__(self, i2c, address, width, height):
        self.i2c = i2c
        self.address = address
        self.width = width
        self.pages = height // 8
        # The picture stays in memory until show() sends it
        self.buffer = bytearray(self.pages * width)
        super().__init__(self.buffer, width, height, framebuf.MONO_VLSB)
        for command in (  # Send the setup commands in order
            0xAE,              # Display off
            0xD5, 0x80,        # Clock
            0xA8, height - 1,  # Multiplex ratio
            0xD3, 0x00,        # Display offset
            0x40,              # Start line
            0x8D, 0x14,        # Internal charge pump on
            0x20, 0x00,        # Horizontal addressing
            0xA1,              # Left-right direction
            0xC8,              # Up-down direction
            0xDA, 0x12 if height == 64 else 0x02,  # COM pin layout
            0x81, 0xCF,        # Contrast
            0xD9, 0xF1,        # Pre-charge
            0xDB, 0x40,        # VCOM voltage
            0xA4,              # Show memory contents
            0xA6,              # Normal, not inverted
            0xAF,              # Display on
        ):
            self.write_command(command)
        self.fill(0)
        self.show()

    # Send one command to the display
    def write_command(self, command):
        self.i2c.writeto(self.address, bytes((0x00, command)))

    def show(self):  # Send the picture in memory to the display
        for command in (0x21, 0, self.width - 1, 0x22, 0, self.pages - 1):
            self.write_command(command)
        self.i2c.writeto(self.address, b"\x40" + self.buffer)


# I2C needs only the SDA and SCL wires
i2c = I2C(0, sda=Pin(SDA_PIN), scl=Pin(SCL_PIN), freq=400000)
found = i2c.scan()  # Scan for devices on the I2C bus
print("I2C device addresses:", [hex(address) for address in found])
if OLED_ADDRESS not in found:
    raise OSError("OLED not found. Check the wiring. Some modules use address 0x3D, which needs a change to OLED_ADDRESS")

oled = SSD1306(i2c, OLED_ADDRESS, WIDTH, HEIGHT)

while True:
    oled.fill(0)  # Clear the picture first
    oled.text("ESP32 Lab", 0, 0)  # Text, then X and Y position
    oled.hline(0, 12, WIDTH, 1)  # Draw a horizontal line
    oled.text("Hello OLED!", 0, 24)
    oled.text("Time: {} s".format(time.ticks_ms() // 1000), 0, 44)
    oled.show()  # Show it once it is all drawn
    time.sleep(1)
