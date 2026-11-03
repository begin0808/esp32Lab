# Example 23 | Timer: a timer blinks the LED every 0.5 seconds by itself while the program does something else
# Wiring: as in example 2, LED through a 220Ω resistor to GPIO 18, short leg to GND
# Compare: example 1 waits with time.sleep and can do nothing else meanwhile; a timer counts in the background, so the program never has to stop
from machine import Pin, Timer
import time

LED_PIN = 18

led = Pin(LED_PIN, Pin.OUT, value=0)


def toggle(timer):  # Runs each time the timer goes off
    led.value(not led.value())


blinker = Timer(0)  # Hardware timer number 0
blinker.init(period=500, mode=Timer.PERIODIC, callback=toggle)  # Run toggle every 500 milliseconds

count = 0
try:
    while True:
        count += 1
        print("The program counted to", count, "and the LED keeps blinking")
        time.sleep(1.5)  # The program keeps its own pace; the LED's pace does not change
finally:  # This also runs when you press "Stop"
    blinker.deinit()  # Turn the timer off, or the LED would keep blinking after the program stops
    led.off()
