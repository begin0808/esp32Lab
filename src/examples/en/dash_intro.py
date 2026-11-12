# Example 27 | Phone dashboard basics: a switch on the phone controls the LED, and the phone shows the button
# Wiring: as in example 2, button between GPIO 19 and GND; LED through a 220Ω resistor to GPIO 18, short leg to GND
# How to use: after uploading, scan the QR code next to the monitor with a phone to open the dashboard. Wi-Fi must reach the internet
# The site saves the dashboard helper dash.py to the board by itself. The code below decides which widgets appear
import time
import dash
from machine import Pin

# Change these to your Wi-Fi name and password (the ESP32 only supports 2.4 GHz)
SSID = "YOUR_WIFI_SSID"
PASSWORD = "YOUR_WIFI_PASSWORD"

LED_PIN = 18
BUTTON_PIN = 19

# MQTT topic name: give each board its own. Enter the same name on the phone dashboard
TOPIC_NAME = "{{CHANNEL}}"

led = Pin(LED_PIN, Pin.OUT, value=0)
button = Pin(BUTTON_PIN, Pin.IN, Pin.PULL_UP)

board = dash.Dashboard(TOPIC_NAME, SSID, PASSWORD)
light = board.switch("LED switch")  # phone -> board: a switch
pressed = board.led("Button")  # board -> phone: a lamp
count = board.value("Presses", unit="")  # board -> phone: a number
board.start()  # Joins Wi-Fi and MQTT, and prints the dashboard's address

presses = 0
last = button.value()
while True:
    board.check()  # Reads the phone, sends new values, and reconnects if the connection drops
    led.value(light.value)  # Read the switch with .value: True is on, False is off

    now = button.value()
    pressed.set(now == 0)  # .set() sends a value to the phone; a pressed button reads 0
    if last == 1 and now == 0:  # Just pressed
        presses += 1
        count.set(presses)
    last = now
    time.sleep_ms(20)
