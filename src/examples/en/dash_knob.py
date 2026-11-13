# Example 29 | Knob and phone slider both dim an LED: turn the potentiometer or drag the phone's slider, and the last one moved wins
# Wiring: potentiometer ends to 3V3 and GND, middle leg to GPIO 34
#         LED through a 220Ω resistor to GPIO 18, short leg to GND
# How to use: after uploading, scan the QR code next to the monitor with a phone to open the dashboard. Wi-Fi must reach the internet
import time
import dash
from machine import ADC, Pin, PWM

# Change these to your Wi-Fi name and password (the ESP32 only supports 2.4 GHz)
SSID = "YOUR_WIFI_SSID"
PASSWORD = "YOUR_WIFI_PASSWORD"

KNOB_PIN = 34
LED_PIN = 18

# MQTT topic name: give each board its own. Enter the same name on the phone dashboard
TOPIC_NAME = "{{CHANNEL}}"
KNOB_STEP = 3  # The knob must move at least 3% to count, so small jitter does not undo the phone's setting

knob = ADC(Pin(KNOB_PIN), atten=ADC.ATTN_11DB)  # Analog input, reads up to about 3.3 V
led = PWM(Pin(LED_PIN), freq=1000, duty_u16=0)  # PWM sets the brightness


def read_knob():  # The knob's position as 0-100%
    return knob.read_u16() * 100 // 65535


board = dash.Dashboard(TOPIC_NAME, SSID, PASSWORD)
brightness = board.slider("LED brightness", min=0, max=100, unit="%")  # phone -> board: a slider
knob_gauge = board.gauge("Knob position", min=0, max=100, unit="%")  # board -> phone: a gauge
full = board.button("Full brightness")  # phone -> board: a press
board.start()

last_knob = read_knob()  # Leave the brightness alone at start, until the knob really turns
last_read = time.ticks_ms()
while True:
    board.check()
    if full.pressed():  # "Full brightness" was pressed on the phone
        brightness.set(100)  # The board can move the slider too, and the phone's slider follows
    led.duty_u16(brightness.value * 65535 // 100)  # Turn 0-100% into PWM's 0-65535

    if time.ticks_diff(time.ticks_ms(), last_read) >= 200:  # Read the knob every 0.2 s
        last_read = time.ticks_ms()
        percent = read_knob()
        knob_gauge.set(percent)
        moved = abs(percent - last_knob) >= KNOB_STEP  # The knob was turned
        if moved or (percent != last_knob and percent in (0, 100)):  # At either end, go all the way even if it moved less than 3%
            last_knob = percent
            brightness.set(percent)  # Move the phone's slider to the knob, and the LED follows
    time.sleep_ms(20)
