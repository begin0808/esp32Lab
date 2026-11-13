# Example 38 | Phone joystick car: the further you push, the faster it goes; push diagonally to turn while driving, and let go to stop
# Wiring as in example 31 (L298N or L9110S motor driver):
#   IN1 (A-1A on the L9110S) to GPIO 18, IN2 (A-1B) to GPIO 19: left motor
#   IN3 (B-1A) to GPIO 21, IN4 (B-1B) to GPIO 22: right motor
#   The driver's GND must be connected to the ESP32's GND
# Power: batteries drive the motors through the driver (for example 4 AA cells); never power the motors from the ESP32. Keep the L298N's ENA and ENB jumpers on
# How to use: after uploading, scan the QR code next to the monitor with a phone to open the dashboard. Wi-Fi must reach the internet
# Safety: the car stops by itself when you let go, the phone drops off, or nothing arrives for 1 s. Lift the car so the wheels spin freely the first time
import time
import dash
from machine import Pin, PWM

# Change these to your Wi-Fi name and password (the ESP32 only supports 2.4 GHz)
SSID = "YOUR_WIFI_SSID"
PASSWORD = "YOUR_WIFI_PASSWORD"

LEFT_A_PIN = 18
LEFT_B_PIN = 19
RIGHT_A_PIN = 21
RIGHT_B_PIN = 22
MIN_POWER = 50  # A usual TT motor does not turn below 50%, so power starts at 50%; raise it if yours still stalls
DEAD_ZONE = 10  # Near the centre (-10 to 10) the car stops, so a shaky finger does not move it

# MQTT topic name: give each board its own. Enter the same name on the phone dashboard
TOPIC_NAME = "{{CHANNEL}}"

# Each motor uses two pins: PWM on one and 0 on the other turns it one way; more PWM turns it faster
left = (PWM(Pin(LEFT_A_PIN), freq=1000, duty_u16=0), PWM(Pin(LEFT_B_PIN), freq=1000, duty_u16=0))
right = (PWM(Pin(RIGHT_A_PIN), freq=1000, duty_u16=0), PWM(Pin(RIGHT_B_PIN), freq=1000, duty_u16=0))


def power(speed):  # Turns -100 to 100 into the power a motor really gets: 0 near the centre, otherwise 50 to 100
    if abs(speed) < DEAD_ZONE:
        return 0
    size = MIN_POWER + abs(speed) * (100 - MIN_POWER) // 100
    return size if speed > 0 else -size


def motor(pins, speed):  # speed is -100 to 100: positive is forward, negative is back
    duty = abs(speed) * 65535 // 100
    pins[0].duty_u16(duty if speed > 0 else 0)
    pins[1].duty_u16(duty if speed < 0 else 0)


board = dash.Dashboard(TOPIC_NAME, SSID, PASSWORD)
stick = board.joystick("Joystick")  # phone -> board: stick.x is left-right, stick.y back-forward, both -100 to 100
state = board.text("Left and right motors")  # board -> phone
board.start()

while True:
    board.check()  # When you let go or the phone drops off, stick.x and stick.y go back to 0 and the car stops
    # Forward plus turn: pushing right makes the left wheel faster and the right wheel slower, so the car turns right
    left_speed = power(max(-100, min(100, stick.y + stick.x)))
    right_speed = power(max(-100, min(100, stick.y - stick.x)))
    motor(left, left_speed)
    motor(right, right_speed)
    state.set("Left {}%, right {}%".format(left_speed, right_speed))
    time.sleep_ms(20)
