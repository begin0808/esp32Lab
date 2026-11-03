# Example 21 | I2C scan: finds the devices on the I2C bus and shows their addresses and likely models
# Wiring: the I2C module's VCC to 3V3, GND to GND, SDA to GPIO 21, SCL to GPIO 22
# Use it when an I2C part such as an OLED or LCD does not respond; it scans every 3 seconds and prints only when the result changes
from machine import I2C, Pin
import time

SDA_PIN = 21
SCL_PIN = 22

# Addresses of common modules; different parts can share an address
KNOWN = {
    0x23: "BH1750 light sensor",
    0x27: "LCD 1602 (PCF8574 backpack)",
    0x38: "AHT10 / AHT20 temperature and humidity sensor",
    0x3C: "SSD1306 OLED display",
    0x3D: "SSD1306 OLED display",
    0x3F: "LCD 1602 (PCF8574A backpack)",
    0x40: "INA219 current sensor or PCA9685 servo driver",
    0x44: "SHT30 temperature and humidity sensor",
    0x48: "ADS1115 analog-to-digital converter",
    0x57: "AT24C32 EEPROM (often on DS3231 clock modules)",
    0x68: "MPU6050 accelerometer or DS3231 clock",
    0x76: "BME280 / BMP280 pressure sensor",
    0x77: "BME280 / BMP280 pressure sensor",
}

i2c = I2C(0, sda=Pin(SDA_PIN), scl=Pin(SCL_PIN), freq=100000)  # A slower speed for scanning copes better with long wires
last = None  # The previous result; there is none yet

while True:
    found = i2c.scan()  # Returns the address of every device that answers
    if found != last:
        if found:
            print("Found", len(found), "I2C devices:")
            for address in found:
                print("  Address", hex(address), "->", KNOWN.get(address, "not a common one; check the part's datasheet"))
        else:
            print("No I2C devices found. Check: SDA and SCL not swapped, VCC and GND connected, and the module really is I2C")
        last = found
    time.sleep(3)
