# Example 1 | Blink an LED: toggles once a second
# Wiring: the onboard blue LED of an ESP32-S board is usually on GPIO 2, so no wiring is needed
# For a wired LED, change LED_PIN to the pin you used (for example GPIO 18)
from machine import Pin  # Pin controls the GPIO pins
import time  # time lets the program pause

LED_PIN = 2  # The pin the LED is on

# Set as an output so it can drive the LED
led = Pin(LED_PIN, Pin.OUT)

while True:  # Repeat the lines below forever
    # Read the state and set the opposite
    led.value(not led.value())
    print("LED:", "on" if led.value() else "off")
    time.sleep(1)  # Pause for 1 second
