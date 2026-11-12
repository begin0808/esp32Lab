# Example 31 | Phone-controlled car: hold a direction key on the phone and the car drives forward, back or turns; let go and it stops
# Wiring (L298N or L9110S motor driver):
#   IN1 (A-1A on the L9110S) to GPIO 18, IN2 (A-1B) to GPIO 19: left motor
#   IN3 (B-1A) to GPIO 21, IN4 (B-1B) to GPIO 22: right motor
#   The driver's GND must be connected to the ESP32's GND
# Power: run the motors from batteries on the driver (for example 4 AA cells), never from the ESP32. Keep the ENA and ENB jumpers on an L298N
# How to use: after uploading, scan the QR code next to the monitor with a phone to open the dashboard. Wi-Fi must reach the internet
# Safety: if the phone drops off or is silent for more than 1 s, the car stops by itself. For the first test, lift the car so the wheels are off the ground
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

# MQTT topic name: give each board its own. Enter the same name on the phone dashboard
TOPIC_NAME = "{{CHANNEL}}"

# Each motor uses two pins: PWM on one and 0 on the other turns it one way; more PWM turns it faster
left = (PWM(Pin(LEFT_A_PIN), freq=1000, duty_u16=0), PWM(Pin(LEFT_B_PIN), freq=1000, duty_u16=0))
right = (PWM(Pin(RIGHT_A_PIN), freq=1000, duty_u16=0), PWM(Pin(RIGHT_B_PIN), freq=1000, duty_u16=0))

# How the left and right motors turn for each direction: 1 forward, -1 back, 0 stop
MOVES = {"up": (1, 1), "down": (-1, -1), "left": (-1, 1), "right": (1, -1), "": (0, 0)}
NAMES = {"up": "Forward", "down": "Back", "left": "Left", "right": "Right", "": "Stopped"}


def motor(pins, speed):  # speed is -100 to 100: positive forward, negative back
    duty = abs(speed) * 65535 // 100
    pins[0].duty_u16(duty if speed > 0 else 0)
    pins[1].duty_u16(duty if speed < 0 else 0)


board = dash.Dashboard(TOPIC_NAME, SSID, PASSWORD)
drive = board.pad("Direction")  # phone -> board: moves only while held
speed = board.slider("Speed", min=30, max=100, unit="%")  # Motors stall at low speeds, so it starts at 30%
state = board.text("Car")  # board -> phone
speed.set(60)  # Start at 60% the first time; later the broker remembers the phone's last setting
board.start()

while True:
    board.check()  # When the phone lets go or drops off, drive.value becomes "" and the car stops
    left_way, right_way = MOVES[drive.value]
    motor(left, left_way * speed.value)
    motor(right, right_way * speed.value)
    state.set("{} ({}%)".format(NAMES[drive.value], speed.value))
    time.sleep_ms(20)
