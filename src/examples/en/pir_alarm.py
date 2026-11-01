# Example 8 | Motion alarm: when the HC-SR501 detects someone, the active buzzer sounds and the LED lights
# Wiring: HC-SR501 VCC to 5V (VIN), GND to GND, OUT to GPIO 27
#         Active buzzer module signal to GPIO 25; LED through a 220Ω resistor to GPIO 18, short leg to GND
# The sensor may give false readings for about a minute after power-up, so ignore that period
from machine import Pin
import time

PIR_PIN = 27
BUZZER_PIN = 25
LED_PIN = 18

# The sensor's output, 1 when someone is there
pir = Pin(PIR_PIN, Pin.IN)
buzzer = Pin(BUZZER_PIN, Pin.OUT, value=0)
led = Pin(LED_PIN, Pin.OUT, value=0)

last = 0  # Remember the previous state

while True:
    now = pir.value()  # Read the sensor
    # Print only on a change, to keep the monitor readable
    if now != last:
        print("Motion detected" if now else "No motion")
        last = now
    buzzer.value(now)  # Sounds while someone is there
    led.value(now)
    time.sleep_ms(100)
