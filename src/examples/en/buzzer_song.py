# Twinkle Twinkle on a passive buzzer: changing the PWM frequency changes the pitch
# Wiring: buzzer positive to GPIO 25, negative to GND (an active buzzer has only one tone, so it will not work here)
from machine import Pin, PWM
import time

BUZZER_PIN = 25
BEAT_MS = 400

# Frequency of each note (Hz)
NOTES = {"C": 262, "D": 294, "E": 330, "F": 349, "G": 392, "A": 440}

# Each item is (note, beats)
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
        # A short gap between notes, so a repeated note is heard as two notes
        buzzer.duty_u16(0)
        time.sleep_ms(40)
    time.sleep(2)
