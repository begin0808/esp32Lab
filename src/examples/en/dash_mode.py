# Example 32 | Menu switches LED modes: choose Off, On, Blink or Breathe on the phone, and the LED changes mode
# Wiring: LED through a 220Ω resistor to GPIO 18, short leg to GND
# How to use: after uploading, scan the QR code next to the monitor with a phone to open the dashboard. Wi-Fi must reach the internet
# Key idea: blinking and breathing work out the brightness from the time instead of waiting with time.sleep, so board.check() keeps hearing the phone
import time
import dash
from machine import Pin, PWM

# Change these to your Wi-Fi name and password (the ESP32 only supports 2.4 GHz)
SSID = "YOUR_WIFI_SSID"
PASSWORD = "YOUR_WIFI_PASSWORD"

LED_PIN = 18

# MQTT topic name: give each board its own. Enter the same name on the phone dashboard
TOPIC_NAME = "{{CHANNEL}}"

led = PWM(Pin(LED_PIN), freq=1000, duty_u16=0)

board = dash.Dashboard(TOPIC_NAME, SSID, PASSWORD)
mode = board.select("LED mode", ["Off", "On", "Blink", "Breathe"])  # phone -> board: a menu
level = board.gauge("Brightness now", min=0, max=100, unit="%", color="yellow")  # board -> phone: a gauge
board.start()

while True:
    board.check()
    now = time.ticks_ms()
    if mode.value == "Off":
        brightness = 0
    elif mode.value == "On":
        brightness = 100
    elif mode.value == "Blink":
        brightness = 100 if now // 500 % 2 == 0 else 0  # Switch every 0.5 s
    else:  # Breathe: dark to bright and back to dark in 2 s
        phase = now % 2000
        brightness = phase // 10 if phase < 1000 else (2000 - phase) // 10
    led.duty_u16(brightness * 65535 // 100)
    level.set(brightness)
    time.sleep_ms(20)
