# SG90 伺服馬達來回轉動：在 0 到 180 度之間慢慢掃動
# 接線：橘線接 GPIO 13、紅線接外部 5V、棕線接 GND（外部電源的 GND 要和 ESP32 接在一起）
from machine import Pin, PWM
import time

SERVO_PIN = 13
# SG90 的脈衝寬度（微秒）：不同馬達略有差異，轉不到底或發出抖動聲時再調整
MIN_US = 500
MAX_US = 2400

servo = PWM(Pin(SERVO_PIN), freq=50, duty_u16=0)


def set_angle(angle):
    pulse_us = MIN_US + (MAX_US - MIN_US) * angle // 180
    # 50 Hz 的週期是 20000 微秒
    servo.duty_u16(pulse_us * 65535 // 20000)


while True:
    for angle in range(0, 181, 5):
        set_angle(angle)
        time.sleep_ms(50)
    print("到達 180 度")
    for angle in range(180, -1, -5):
        set_angle(angle)
        time.sleep_ms(50)
    print("回到 0 度")
