# DHT11 (no Wi-Fi needed): shows temperature and humidity in the monitor every 2 seconds
# Wiring: DHT11 VCC to 3V3, GND to GND, DATA to GPIO 4
import dht
import time
from machine import Pin

DHT_PIN = 4

sensor = dht.DHT11(Pin(DHT_PIN))

while True:
    try:
        sensor.measure()
        print("Temperature:", sensor.temperature(), "°C  Humidity:", sensor.humidity(), "%")
    except OSError:
        print("Could not read the sensor. Check the wiring")
    time.sleep(2)
