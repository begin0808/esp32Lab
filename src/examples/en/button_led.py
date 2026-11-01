# Example 2 | Button-controlled LED: each press toggles the LED
# Wiring: button between GPIO 19 and GND; LED through a 220Ω resistor to GPIO 18, short leg to GND
from machine import Pin
import time

LED_PIN = 18
BUTTON_PIN = 19

led = Pin(LED_PIN, Pin.OUT, value=0)  # An output that starts off
# Uses the internal pull-up: reads 1 when released and 0 when pressed
button = Pin(BUTTON_PIN, Pin.IN, Pin.PULL_UP)

last = button.value()  # Remember the previous button state

while True:
    now = button.value()  # Read the button now
    # A change from 1 to 0 means it was just pressed
    if last == 1 and now == 0:
        led.value(not led.value())  # Toggle the LED
        print("LED:", "on" if led.value() else "off")
    last = now  # Keep it to compare next time
    # Wait before reading again to skip the button's contact bounce
    time.sleep_ms(30)
