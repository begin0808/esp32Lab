# Example 33 | Send text to the OLED: type English on the phone, and the OLED display shows it
# Wiring: VCC to 3V3, GND to GND, SDA to GPIO 21, SCL to GPIO 22
# How to use: after uploading, scan the QR code next to the monitor with a phone to open the dashboard. Wi-Fi must reach the internet
# The built-in font only has English letters, digits and symbols; other characters show as "?". The SSD1306 class below is the same as in example 13
import time
import dash
import framebuf
from machine import I2C, Pin

# Change these to your Wi-Fi name and password (the ESP32 only supports 2.4 GHz)
SSID = "YOUR_WIFI_SSID"
PASSWORD = "YOUR_WIFI_PASSWORD"

SDA_PIN = 21
SCL_PIN = 22
WIDTH = 128
HEIGHT = 64
OLED_ADDRESS = 0x3C
COLUMNS = WIDTH // 8  # Each character is 8 dots wide, so 16 to a line
ROWS = HEIGHT // 10  # Each line is 10 dots tall, so at most 6 lines

# MQTT topic name: give each board its own. Enter the same name on the phone dashboard
TOPIC_NAME = "{{CHANNEL}}"


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


def show_message(text):  # Cuts the text into lines of 16 characters and shows it on the OLED
    # The built-in font has no other scripts, so unknown characters become ?
    text = "".join(char if 32 <= ord(char) < 127 else "?" for char in text)
    oled.fill(0)
    for row in range(ROWS):
        oled.text(text[row * COLUMNS:(row + 1) * COLUMNS], 0, row * 10)
    oled.show()


i2c = I2C(0, sda=Pin(SDA_PIN), scl=Pin(SCL_PIN), freq=400000)
if OLED_ADDRESS not in i2c.scan():
    raise OSError("OLED not found. Check the wiring. Some modules use address 0x3D; change OLED_ADDRESS")
oled = SSD1306(i2c, OLED_ADDRESS, WIDTH, HEIGHT)
show_message("Waiting for the phone...")

board = dash.Dashboard(TOPIC_NAME, SSID, PASSWORD)
message = board.input("Text to show")  # phone -> board: text input
clear = board.button("Clear screen")  # phone -> board: a button
board.start()

while True:
    board.check()
    if message.changed():  # New text from the phone
        show_message(message.value)
        print("showing:", message.value)
    if clear.pressed():
        show_message("")
        print("cleared")
    time.sleep_ms(20)
