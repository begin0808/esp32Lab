# Example 6 | SG90 servo sweep: moves slowly between 0 and 180 degrees
# Wiring: orange wire to GPIO 13, red to external 5V, brown to GND (the external supply's GND must connect to the ESP32's)
from machine import Pin, PWM
import time

SERVO_PIN = 13
# SG90 pulse widths in microseconds: motors vary, so adjust these if it stops short or jitters
MIN_US = 500
MAX_US = 2400

# Servos use a 50 Hz signal
servo = PWM(Pin(SERVO_PIN), freq=50, duty_u16=0)


def set_angle(angle):  # Turn an angle into a pulse width
    # 0 degrees is MIN_US and 180 is MAX_US
    pulse_us = MIN_US + (MAX_US - MIN_US) * angle // 180
    # A 50 Hz period is 20000 microseconds
    servo.duty_u16(pulse_us * 65535 // 20000)


while True:
    # Turn 5 degrees at a time, from 0 to 180
    for angle in range(0, 181, 5):
        set_angle(angle)
        time.sleep_ms(50)  # Give the motor time to get there
    print("Reached 180 degrees")
    for angle in range(180, -1, -5):  # And back to 0
        set_angle(angle)
        time.sleep_ms(50)
    print("Back at 0 degrees")
