# MAX7219 8×8 LED matrix: alternates between a smiley and a heart
# Wiring: VCC to 5V (VIN), GND to GND, DIN to GPIO 23, CLK to GPIO 18, CS to GPIO 5
# The firmware has no driver for this part. The MAX7219 class below is included in this file, so there is nothing else to install
# On 5V power, 3.3V signals may be unreliable. Add a level shifter if the display misbehaves
from machine import Pin
import time

DIN_PIN = 23
CLK_PIN = 18
CS_PIN = 5
BRIGHTNESS = 2  # 0 to 15

# Each picture has 8 rows of 8 bits, where 1 means lit
SMILE = (
    0b00111100,
    0b01000010,
    0b10100101,
    0b10000001,
    0b10100101,
    0b10011001,
    0b01000010,
    0b00111100,
)
HEART = (
    0b00000000,
    0b01100110,
    0b11111111,
    0b11111111,
    0b01111110,
    0b00111100,
    0b00011000,
    0b00000000,
)


class MAX7219:
    def __init__(self, din, clk, cs, brightness):
        self.din = din
        self.clk = clk
        self.cs = cs
        self.write(0x0F, 0)  # Test mode off
        self.write(0x09, 0)  # No seven-segment decoding
        self.write(0x0B, 7)  # Scan all 8 rows
        self.write(0x0A, brightness)
        self.write(0x0C, 1)  # Leave shutdown mode

    def write(self, register, value):
        self.cs.value(0)
        # Send 16 bits at a time, highest bit first
        data = register << 8 | value
        for bit in range(15, -1, -1):
            self.din.value((data >> bit) & 1)
            self.clk.value(1)
            self.clk.value(0)
        self.cs.value(1)

    def show(self, rows):
        for index, row in enumerate(rows):
            self.write(index + 1, row)


din = Pin(DIN_PIN, Pin.OUT, value=0)
clk = Pin(CLK_PIN, Pin.OUT, value=0)
cs = Pin(CS_PIN, Pin.OUT, value=1)
matrix = MAX7219(din, clk, cs, BRIGHTNESS)

while True:
    matrix.show(SMILE)
    time.sleep(1)
    matrix.show(HEART)
    time.sleep(1)
