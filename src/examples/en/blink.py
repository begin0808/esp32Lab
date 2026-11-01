# Blink an LED: toggles once a second
# Wiring: the onboard blue LED of an ESP32-S board is usually on GPIO 2, so no wiring is needed
# For a wired LED, change LED_PIN to the pin you used (for example GPIO 18)
from machine import Pin
import time

LED_PIN = 2

led = Pin(LED_PIN, Pin.OUT)

while True:
    led.value(not led.value())
    print("LED:", "on" if led.value() else "off")
    time.sleep(1)
