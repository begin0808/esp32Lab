# Button-controlled LED: each press toggles the LED
# Wiring: button between GPIO 19 and GND; LED through a 220Ω resistor to GPIO 18, short leg to GND
from machine import Pin
import time

LED_PIN = 18
BUTTON_PIN = 19

led = Pin(LED_PIN, Pin.OUT, value=0)
# Uses the internal pull-up: reads 1 when released and 0 when pressed
button = Pin(BUTTON_PIN, Pin.IN, Pin.PULL_UP)

last = button.value()

while True:
    now = button.value()
    if last == 1 and now == 0:
        led.value(not led.value())
        print("LED:", "on" if led.value() else "off")
    last = now
    # Wait before reading again to skip the button's contact bounce
    time.sleep_ms(30)
