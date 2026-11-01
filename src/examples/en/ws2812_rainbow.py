# Example 12 | WS2812 RGB LED rainbow: colours flow along the strip
# Wiring: VCC to 5V (VIN), GND to GND, DIN to GPIO 16
# Above about 8 LEDs, use an external 5V supply and connect its GND to the ESP32's
from machine import Pin
from neopixel import NeoPixel
import time

LED_PIN = 16
LED_COUNT = 8
# Brightness from 0 to 255. Full brightness is harsh and power-hungry; a low value is enough
BRIGHTNESS = 40

# Create the LED strip object
strip = NeoPixel(Pin(LED_PIN), LED_COUNT)


# Turn a position from 0 to 255 into a rainbow colour
def wheel(position):
    position %= 256  # Wrap around after 255
    if position < 85:
        red, green, blue = 255 - position * 3, position * 3, 0
    elif position < 170:
        position -= 85
        red, green, blue = 0, 255 - position * 3, position * 3
    else:
        position -= 170
        red, green, blue = position * 3, 0, 255 - position * 3
    # Dim to the chosen brightness
    return (red * BRIGHTNESS // 255, green * BRIGHTNESS // 255, blue * BRIGHTNESS // 255)


offset = 0  # Where the rainbow starts; changing it makes it flow

while True:
    for index in range(LED_COUNT):
        # Each LED takes a different place on the rainbow
        strip[index] = wheel(offset + index * 256 // LED_COUNT)
    strip.write()  # Only this line actually updates the LEDs
    # Move the start so the colours flow
    offset = (offset + 4) % 256
    time.sleep_ms(40)
