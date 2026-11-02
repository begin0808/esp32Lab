# Example 10 | DHT11 (no Wi-Fi needed): shows temperature and humidity in the monitor every 2 seconds
# Wiring: DHT11 VCC to 3V3, GND to GND, DATA to GPIO 4
# Chart: after uploading, switch the monitor to "Chart" to see temperature and humidity; breathe on the sensor and the humidity rises
import dht
import time
from machine import Pin

DHT_PIN = 4

sensor = dht.DHT11(Pin(DHT_PIN))  # Create the sensor object

while True:
    try:  # Reading can fail, so it goes in a try
        sensor.measure()  # Measure first, then read the values
        print("Temperature:", sensor.temperature(), "°C  Humidity:", sensor.humidity(), "%")
    except OSError:  # A wiring problem ends up here
        print("Could not read the sensor. Check the wiring")
    time.sleep(2)  # The DHT11 cannot be read too often
