# Example 24 | Deep sleep: wakes up, blinks the LED, counts the wake-ups, then sleeps 10 seconds to save power
# Wiring: uses the onboard blue LED of an ESP32-S board (GPIO 2), so no wiring is needed
# Use "Upload and run": a program started with "Run (no save)" is gone once the board sleeps, and it wakes into its own main.py
# The board ignores the site while asleep; after waking you have 5 seconds to press "Stop" before you can change or upload a program
# Boards with built-in USB (S2, S3, C3) drop the USB connection while asleep; connect the board again after it wakes
import machine
import time
from machine import Pin

LED_PIN = 2
AWAKE_SECONDS = 5  # Seconds to stay awake
SLEEP_SECONDS = 10  # Seconds to sleep

led = Pin(LED_PIN, Pin.OUT, value=0)
rtc = machine.RTC()

# Ordinary variables are lost in deep sleep, but RTC memory is kept, so it remembers the wake-ups
if machine.reset_cause() == machine.DEEPSLEEP_RESET and rtc.memory():
    count = int(rtc.memory().decode()) + 1
    print("Woke from deep sleep,", count, "times so far")
else:
    count = 0
    print("Just powered up or restarted; counting from 0")
rtc.memory(str(count).encode())  # Save it in RTC memory for the next wake-up

led.on()  # A short blink to show it is awake
time.sleep(0.2)
led.off()

for left in range(AWAKE_SECONDS, 0, -1):
    print(left, "seconds until sleep; press 'Stop' now to interrupt")
    time.sleep(1)

print("Sleeping", SLEEP_SECONDS, "seconds; main.py runs again on waking")
time.sleep_ms(50)  # Let the last line go out before sleeping
machine.deepsleep(SLEEP_SECONDS * 1000)  # In milliseconds; waking up is like a fresh start
