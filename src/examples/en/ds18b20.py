# DS18B20 thermometer: shows the temperature in the monitor every 2 seconds
# Wiring: VCC to 3V3, GND to GND, DATA to GPIO 4
# A bare sensor needs a 4.7kΩ resistor between DATA and 3V3; modules usually include one
from machine import Pin
import ds18x20
import onewire
import time

DATA_PIN = 4

sensor = ds18x20.DS18X20(onewire.OneWire(Pin(DATA_PIN)))

while True:
    devices = sensor.scan()
    if not devices:
        print("DS18B20 not found. Check the wiring and the pull-up resistor")
        time.sleep(2)
        continue
    sensor.convert_temp()
    # The sensor needs about 750 ms to finish measuring
    time.sleep_ms(750)
    for device in devices:
        print("Temperature: {:.2f} °C".format(sensor.read_temp(device)))
    time.sleep_ms(1250)
