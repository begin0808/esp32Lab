# Potentiometer LED dimmer: turning the knob brightens or dims the LED
# Wiring: potentiometer ends to 3V3 and GND, middle pin to GPIO 34
#         LED through a 220Ω resistor to GPIO 18, short leg to GND
from machine import ADC, Pin, PWM
import time

KNOB_PIN = 34
LED_PIN = 18

knob = ADC(Pin(KNOB_PIN), atten=ADC.ATTN_11DB)
led = PWM(Pin(LED_PIN), freq=1000, duty_u16=0)

while True:
    value = knob.read_u16()
    led.duty_u16(value)
    print("Knob:", value * 100 // 65535, "%")
    time.sleep_ms(200)
