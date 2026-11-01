# Example 7 | Automatic night light: the LED turns on when the room gets dark
# Wiring: photoresistor between 3V3 and GPIO 34, and GPIO 34 through a 10kΩ resistor to GND
#         LED through a 220Ω resistor to GPIO 18, short leg to GND
# More light gives a higher reading. Check the number in the monitor, then adjust DARK_LEVEL
from machine import ADC, Pin
import time

SENSOR_PIN = 34
LED_PIN = 18
DARK_LEVEL = 15000

# Analog input that reads up to about 3.3 V
sensor = ADC(Pin(SENSOR_PIN), atten=ADC.ATTN_11DB)
led = Pin(LED_PIN, Pin.OUT, value=0)  # Starts off

while True:
    # Read the light level, from 0 to 65535
    level = sensor.read_u16()
    # Light up when darker than the threshold
    led.value(level < DARK_LEVEL)
    print("Light:", level, "LED:", "on" if led.value() else "off")
    time.sleep_ms(500)
