# Example 26 | asyncio, three things at once: blink an LED, watch a button, and report the running time every 2 seconds
# Wiring: as in example 2, button between GPIO 19 and GND; LED through a 220Ω resistor to GPIO 18, short leg to GND
# The key: each job is an async function, and it waits with await asyncio.sleep, handing the time to the other jobs
# With time.sleep instead, the whole board would stop and wait, and the other jobs with it
import asyncio
import time
from machine import Pin

LED_PIN = 18
BUTTON_PIN = 19

led = Pin(LED_PIN, Pin.OUT, value=0)
button = Pin(BUTTON_PIN, Pin.IN, Pin.PULL_UP)
blink_ms = 500  # Time between LED changes; the button switches it between fast and slow


async def blink():  # Job one: keep blinking the LED
    while True:
        led.value(not led.value())
        await asyncio.sleep_ms(blink_ms)


async def watch_button():  # Job two: each press switches between fast and slow blinking
    global blink_ms
    last = button.value()
    while True:
        now = button.value()
        if last == 1 and now == 0:
            blink_ms = 100 if blink_ms == 500 else 500
            print("Button pressed, LED now blinks", "fast" if blink_ms == 100 else "slowly")
        last = now
        await asyncio.sleep_ms(30)


async def report():  # Job three: every 2 seconds, say how long the program has run
    start = time.ticks_ms()
    while True:
        await asyncio.sleep(2)
        print("Running for", time.ticks_diff(time.ticks_ms(), start) // 1000, "seconds")


async def main():
    asyncio.create_task(blink())  # Hand it to asyncio, which takes turns between the jobs
    asyncio.create_task(watch_button())
    await report()  # This job never ends, so the program keeps running


asyncio.run(main())
