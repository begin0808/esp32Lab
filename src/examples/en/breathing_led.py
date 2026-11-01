# Breathing LED: PWM slowly brightens and then dims the LED
# Wiring: LED through a 220Ω resistor to GPIO 18, short leg to GND
from machine import Pin, PWM
import time

LED_PIN = 18

led = PWM(Pin(LED_PIN), freq=1000, duty_u16=0)

while True:
    for percent in range(0, 101, 2):
        led.duty_u16(percent * 65535 // 100)
        time.sleep_ms(20)
    for percent in range(100, -1, -2):
        led.duty_u16(percent * 65535 // 100)
        time.sleep_ms(20)
