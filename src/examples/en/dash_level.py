# Example 37 | Phone spirit level: tilt the phone and the ball on the OLED rolls to the lower side; it shows LEVEL! when the phone is flat
# Wiring: VCC to 3V3, GND to GND, SDA to GPIO 21, SCL to GPIO 22
# How to use: after uploading, scan the QR code next to the monitor with a phone to open the dashboard, then press "Start tilt control". Wi-Fi must reach the internet
# An iPhone first asks whether the page may use motion sensors; choose "Allow". The SSD1306 class below is the same as in example 13
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
TOP = 10  # Text goes in the top 10 dots; the ball rolls below
CENTER_X = WIDTH // 2
CENTER_Y = (TOP + HEIGHT - 1) // 2
REACH_X = CENTER_X - 5  # How far from the centre the ball goes at full tilt
REACH_Y = CENTER_Y - TOP - 4
LEVEL = 5  # Level when both left-right and back-forward are between -5 and 5

# MQTT topic name: give each board its own. Enter the same name on the phone dashboard
TOPIC_NAME = "{{CHANNEL}}"


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


def draw(x, y, on):  # Draws the frame, the centre cross and the ball
    oled.fill(0)
    oled.rect(0, TOP, WIDTH, HEIGHT - TOP, 1)
    oled.hline(CENTER_X - 8, CENTER_Y, 17, 1)
    oled.vline(CENTER_X, CENTER_Y - 8, 17, 1)
    ball_x = CENTER_X + x * REACH_X // 100  # Tip right and the ball rolls right
    ball_y = CENTER_Y - y * REACH_Y // 100  # Tip forward and the ball rolls up
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
    raise OSError("OLED not found. Check the wiring. Some modules use address 0x3D, so change OLED_ADDRESS")
oled = SSD1306(i2c, OLED_ADDRESS, WIDTH, HEIGHT)

board = dash.Dashboard(TOPIC_NAME, SSID, PASSWORD)
tilt = board.tilt("Tilt the phone")  # phone -> board: tilt.x is left-right, tilt.y back-forward, both -100 to 100
state = board.text("Spirit level")  # board -> phone
board.start()

last = None
while True:
    board.check()  # When the phone stops tilt control or drops off, tilt.x and tilt.y go back to 0
    now = (tilt.x, tilt.y, tilt.on)
    if now != last:  # Redraw only when something changed, so the OLED does not flicker
        last = now
        draw(tilt.x, tilt.y, tilt.on)
        if not tilt.on:
            state.set("Press Start tilt control on the phone")
        elif abs(tilt.x) <= LEVEL and abs(tilt.y) <= LEVEL:
            state.set("Level!")
        else:
            state.set("Not level yet: left-right {}, back-forward {}".format(tilt.x, tilt.y))
    time.sleep_ms(20)
