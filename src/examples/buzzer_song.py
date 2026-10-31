# 無源蜂鳴器播放小星星：改變 PWM 頻率就能發出不同音高
# 接線：蜂鳴器正極接 GPIO 25、負極接 GND（有源蜂鳴器只有一種音，不適用這個範例）
from machine import Pin, PWM
import time

BUZZER_PIN = 25
BEAT_MS = 400

# 各音的頻率（Hz）
NOTES = {"C": 262, "D": 294, "E": 330, "F": 349, "G": 392, "A": 440}

# 每個項目是（音名, 拍數）
SONG = [
    ("C", 1), ("C", 1), ("G", 1), ("G", 1), ("A", 1), ("A", 1), ("G", 2),
    ("F", 1), ("F", 1), ("E", 1), ("E", 1), ("D", 1), ("D", 1), ("C", 2),
]

buzzer = PWM(Pin(BUZZER_PIN), freq=NOTES["C"], duty_u16=0)

while True:
    for note, beats in SONG:
        buzzer.freq(NOTES[note])
        buzzer.duty_u16(32768)
        time.sleep_ms(beats * BEAT_MS - 40)
        # 每個音之間停一下，同音連續才聽得出是兩個音
        buzzer.duty_u16(0)
        time.sleep_ms(40)
    time.sleep(2)
