# Example 34 | Doorbell alert on the phone: press the board's button and the phone pops up an alert; press "Reply" on the phone and the board's LED blinks for 3 s
# Wiring: as in example 2, button between GPIO 19 and GND; LED through a 220Ω resistor to GPIO 18, short leg to GND
# How to use: after uploading, scan the QR code next to the monitor with a phone to open the dashboard, then tap "Turn on alert sound". Wi-Fi must reach the internet
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
bell = board.alert("Doorbell")  # board -> phone: an alert
count = board.value("Rings today", unit="")  # board -> phone: a number
answer = board.button("Reply: coming")  # phone -> board: a button
board.start()

rings = 0
last = button.value()
blink_until = time.ticks_ms()  # When the LED stops blinking
while True:
    board.check()
    now = button.value()
    if last == 1 and now == 0:  # Just pressed
        rings += 1
        bell.send("Someone is at the door! (ring {})".format(rings))
        count.set(rings)
        print("Ding dong! Ring {}".format(rings))
    last = now

    if answer.pressed():  # "Reply" was pressed on the phone
        blink_until = time.ticks_add(time.ticks_ms(), 3000)
        print("The phone replied: coming")
    if time.ticks_diff(blink_until, time.ticks_ms()) > 0:
        led.value(time.ticks_ms() // 200 % 2)  # Switch every 0.2 s
    else:
        led.value(0)
    time.sleep_ms(20)
