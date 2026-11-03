# Example 22 | Button interrupt (IRQ): each press is noted the moment it happens, so none are missed while the program is busy
# Wiring: as in example 2, button between GPIO 19 and GND; LED through a 220Ω resistor to GPIO 18, short leg to GND
# Compare: example 2 keeps reading the button; here the button tells the program, which looks only every 2 seconds and still misses nothing
from machine import Pin
import time

LED_PIN = 18
BUTTON_PIN = 19

led = Pin(LED_PIN, Pin.OUT, value=0)
button = Pin(BUTTON_PIN, Pin.IN, Pin.PULL_UP)  # Reads 1 when released and 0 when pressed

presses = 0  # How many presses in all
last_press = 0  # When the last counted press happened (milliseconds)


def on_press(pin):  # The interrupt handler: when the button is pressed, the board pauses what it is doing to run this
    global presses, last_press
    now = time.ticks_ms()
    # A button bounces several times as it closes, so repeats within 200 milliseconds do not count
    if time.ticks_diff(now, last_press) > 200:
        presses += 1
        last_press = now
        led.value(not led.value())  # Keep handlers short: note it and toggle the LED, no sleeping or slow work


# Pressing drops the pin from 1 to 0, which is called a falling edge (IRQ_FALLING)
button.irq(trigger=Pin.IRQ_FALLING, handler=on_press)

shown = 0  # How many presses have been printed
try:
    while True:
        time.sleep(2)  # Pretend the program is busy and comes back only every 2 seconds
        if presses != shown:
            print("Pressed", presses - shown, "times in 2 seconds,", presses, "in all")
            shown = presses
finally:  # This also runs when you press "Stop"
    button.irq(handler=None)  # Remove the interrupt, or the button would still toggle the LED after the program stops
