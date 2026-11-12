# Example 30 | Pick a colour for an RGB LED: choose a colour on the phone, and the WS2812 strip changes to it
# Wiring: VCC to 5V (VIN), GND to GND, DIN to GPIO 16
# How to use: after uploading, scan the QR code next to the monitor with a phone to open the dashboard. Wi-Fi must reach the internet
# For more than about 8 LEDs, use an external 5V supply and connect its GND to the ESP32's GND
import time
import dash
from machine import Pin
from neopixel import NeoPixel

# Change these to your Wi-Fi name and password (the ESP32 only supports 2.4 GHz)
SSID = "YOUR_WIFI_SSID"
PASSWORD = "YOUR_WIFI_PASSWORD"

LED_PIN = 16
LED_COUNT = 8

# MQTT topic name: give each board its own. Enter the same name on the phone dashboard
TOPIC_NAME = "{{CHANNEL}}"

strip = NeoPixel(Pin(LED_PIN), LED_COUNT)

board = dash.Dashboard(TOPIC_NAME, SSID, PASSWORD)
shade = board.color("LED colour")  # phone -> board: a colour picker
level = board.slider("Brightness", min=0, max=100, unit="%")  # phone -> board: a slider
# Start at 20% brightness the first time; full brightness is glaring and uses a lot of power. Later the broker remembers the phone's last setting
level.set(20)
board.start()

shown = None
while True:
    board.check()
    red, green, blue = shade.value  # The colour is (red, green, blue), each 0-255
    # Dim all three colours by the same share of the brightness
    color = (red * level.value // 100, green * level.value // 100, blue * level.value // 100)
    if color != shown:  # Only update the strip when the colour changes
        strip.fill(color)
        strip.write()
        print("colour:", color)
        shown = color
    time.sleep_ms(20)
