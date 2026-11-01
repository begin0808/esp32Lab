# Example 3 | Breathing LED: PWM slowly brightens and then dims the LED
# Wiring: LED through a 220Ω resistor to GPIO 18, short leg to GND
from machine import Pin, PWM
import time

LED_PIN = 18

# PWM switches 1000 times a second, starting off
led = PWM(Pin(LED_PIN), freq=1000, duty_u16=0)

while True:
    # Brightness from 0% to 100% in steps of 2
    for percent in range(0, 101, 2):
        # Convert the percentage to 0-65535
        led.duty_u16(percent * 65535 // 100)
        time.sleep_ms(20)  # Wait 20 ms; larger is slower
    for percent in range(100, -1, -2):  # Back down from 100% to 0%
        led.duty_u16(percent * 65535 // 100)
        time.sleep_ms(20)
