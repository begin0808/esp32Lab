# 範例 9｜HC-SR04 超音波測距：每半秒在監控窗顯示距離
# 接線：VCC 接 5V（VIN）、GND 接 GND、Trig 接 GPIO 26
#       Echo 是 5V 訊號，一定要先分壓：Echo 經 1kΩ 接 GPIO 33，GPIO 33 再經 2kΩ 接 GND
from machine import Pin, time_pulse_us
import time

TRIG_PIN = 26
ECHO_PIN = 33
# 等超過 30 毫秒沒有回音就放棄，約等於 5 公尺
TIMEOUT_US = 30000

trig = Pin(TRIG_PIN, Pin.OUT, value=0)  # 發射腳，平常保持低電位
echo = Pin(ECHO_PIN, Pin.IN)  # 接收腳


def read_distance_cm():
    trig.value(1)  # 送出 10 微秒的觸發訊號
    time.sleep_us(10)
    trig.value(0)
    duration = time_pulse_us(echo, 1, TIMEOUT_US)  # 量 Echo 維持高電位多久
    if duration < 0:  # 負數代表逾時，沒有收到回音
        return None
    # 聲音一來一回，每公分約 58 微秒
    return duration / 58


while True:
    distance = read_distance_cm()
    if distance is None:
        print("沒有收到回音，請檢查接線或前方距離")
    else:
        print("距離: {:.1f} 公分".format(distance))
    time.sleep_ms(500)  # 每 0.5 秒量一次
