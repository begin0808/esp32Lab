# Example 35 | Set a humidity limit from the phone: the LED lights when the humidity goes over the limit set on the phone, so experiments need no code changes
# Wiring: DHT11 VCC to 3V3, GND to GND, DATA to GPIO 4; LED through a 220Ω resistor to GPIO 18, short leg to GND
# How to use: after uploading, scan the QR code next to the monitor with a phone to open the dashboard. Wi-Fi must reach the internet
# Try this: set the limit 5% above the humidity now, then breathe on the sensor and see when the LED lights
import time
import dash
import dht
from machine import Pin

# Change these to your Wi-Fi name and password (the ESP32 only supports 2.4 GHz)
SSID = "YOUR_WIFI_SSID"
PASSWORD = "YOUR_WIFI_PASSWORD"

DHT_PIN = 4
LED_PIN = 18
READ_MS = 3000  # Read every 3 s; the DHT11 cannot be read faster

# MQTT topic name: give each board its own. Enter the same name on the phone dashboard
TOPIC_NAME = "{{CHANNEL}}"

sensor = dht.DHT11(Pin(DHT_PIN))
led = Pin(LED_PIN, Pin.OUT, value=0)

board = dash.Dashboard(TOPIC_NAME, SSID, PASSWORD)
# phone -> board: a number setting, changed with - and + or typed in. The broker remembers it, even after the board restarts
limit = board.number("Humidity limit", value=70, min=30, max=95, step=5, unit="%")
humidity_gauge = board.gauge("Humidity", min=0, max=100, unit="%", color="blue")  # board -> phone: a gauge
lamp = board.led("Over the limit", color="red")  # board -> phone: a lamp
board.start()

humidity = None  # The newest humidity reading, None until the first one
last_read = time.ticks_ms() - READ_MS
while True:
    board.check()
    if limit.changed():  # The phone changed the limit
        print("New limit:", limit.value, "%")
    if time.ticks_diff(time.ticks_ms(), last_read) >= READ_MS:
        last_read = time.ticks_ms()
        try:
            sensor.measure()
            humidity = sensor.humidity()
            humidity_gauge.set(humidity)
            print("Humidity:", humidity, "%  limit:", limit.value, "%")
        except OSError:  # Ends up here when the wiring is wrong
            print("Could not read the sensor. Check the wiring")
    if humidity is not None:
        too_wet = humidity > limit.value  # Compared with the newest limit every time round, so a change on the phone shows at once
        led.value(too_wet)
        lamp.set(too_wet)
    time.sleep_ms(20)
