# Example 4 | Potentiometer LED dimmer: turning the knob brightens or dims the LED
# Wiring: potentiometer ends to 3V3 and GND, middle pin to GPIO 34
#         LED through a 220Ω resistor to GPIO 18, short leg to GND
from machine import ADC, Pin, PWM
import time

KNOB_PIN = 34
LED_PIN = 18

# Analog input that reads up to about 3.3 V
knob = ADC(Pin(KNOB_PIN), atten=ADC.ATTN_11DB)
# PWM sets the brightness
led = PWM(Pin(LED_PIN), freq=1000, duty_u16=0)

while True:
    value = knob.read_u16()  # Read the knob, from 0 to 65535
    # PWM has the same range, so use it directly
    led.duty_u16(value)
    # Show it as a percentage
    print("Knob:", value * 100 // 65535, "%")
    time.sleep_ms(200)  # Update five times a second
