# Example 28 | DHT11 dashboard: see a temperature gauge, the humidity and a temperature chart on a phone
# Wiring: DHT11 VCC to 3V3, GND to GND, DATA to GPIO 4
# How to use: after uploading, scan the QR code next to the monitor with a phone to open the dashboard. Wi-Fi must reach the internet
# Try it: breathe on the sensor and watch the humidity and the chart change
import time
import dash
import dht
from machine import Pin

# Change these to your Wi-Fi name and password (the ESP32 only supports 2.4 GHz)
SSID = "YOUR_WIFI_SSID"
PASSWORD = "YOUR_WIFI_PASSWORD"

DHT_PIN = 4
HOT = 30  # Above this temperature, the phone shows a warning

# MQTT topic name: give each board its own. Enter the same name on the phone dashboard
TOPIC_NAME = "{{CHANNEL}}"

sensor = dht.DHT11(Pin(DHT_PIN))

board = dash.Dashboard(TOPIC_NAME, SSID, PASSWORD)
temp_gauge = board.gauge("Temperature", min=0, max=50, unit="°C")  # A half-circle gauge
humidity = board.value("Humidity", unit="%")  # A big number
history = board.chart("Temperature over time", unit="°C")  # A line chart of the last 60 values
note = board.text("Status")  # One line of text
board.start()

last_read = time.ticks_ms() - 2000
while True:
    board.check()
    # The DHT11 cannot be read too often, so read it every 2 s; board.check() keeps running in between
    if time.ticks_diff(time.ticks_ms(), last_read) >= 2000:
        last_read = time.ticks_ms()
        try:
            sensor.measure()
            temp = sensor.temperature()
            temp_gauge.set(temp)
            history.set(temp)
            humidity.set(sensor.humidity())
            note.set("Too hot, open a window" if temp > HOT else "Temperature normal")
            print("temp:", temp, "°C  humidity:", sensor.humidity(), "%")
        except OSError:  # A wiring problem ends up here
            note.set("Reading failed, check the wiring")
            print("Reading failed, check the wiring")
    time.sleep_ms(20)
