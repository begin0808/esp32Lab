# HC-SR04 ultrasonic distance: shows the distance in the monitor every half second
# Wiring: VCC to 5V (VIN), GND to GND, Trig to GPIO 26
#         Echo is a 5V signal and must be divided first: Echo through 1kΩ to GPIO 33, and GPIO 33 through 2kΩ to GND
from machine import Pin, time_pulse_us
import time

TRIG_PIN = 26
ECHO_PIN = 33
# Give up after 30 ms with no echo, which is about 5 metres
TIMEOUT_US = 30000

trig = Pin(TRIG_PIN, Pin.OUT, value=0)
echo = Pin(ECHO_PIN, Pin.IN)


def read_distance_cm():
    trig.value(1)
    time.sleep_us(10)
    trig.value(0)
    duration = time_pulse_us(echo, 1, TIMEOUT_US)
    if duration < 0:
        return None
    # Sound goes there and back, about 58 microseconds per centimetre
    return duration / 58


while True:
    distance = read_distance_cm()
    if distance is None:
        print("No echo received. Check the wiring and the distance ahead")
    else:
        print("Distance: {:.1f} cm".format(distance))
    time.sleep_ms(500)
