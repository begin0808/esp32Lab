# Example 28 | DHT11 dashboard: temperature and humidity gauges and a humidity chart on a phone, with a warning when it is too hot
# Wiring: DHT11 VCC to 3V3, GND to GND, DATA to GPIO 4
# How to use: after uploading, scan the QR code next to the monitor with a phone to open the dashboard. Wi-Fi must reach the internet
# Try it: breathe on the sensor; the humidity rises clearly, and the humidity chart goes up with it
import time
import dash
import dht
from machine import Pin

# Change these to your Wi-Fi name and password (the ESP32 only supports 2.4 GHz)
SSID = "YOUR_WIFI_SSID"
PASSWORD = "YOUR_WIFI_PASSWORD"

DHT_PIN = 4
HOT = 30  # Above 30°C, the status on the phone shows a warning
READ_MS = 3000  # Read every 3 s; the DHT11 cannot be read too often

# MQTT topic name: give each board its own. Enter the same name on the phone dashboard
TOPIC_NAME = "{{CHANNEL}}"

sensor = dht.DHT11(Pin(DHT_PIN))

board = dash.Dashboard(TOPIC_NAME, SSID, PASSWORD)
temp_gauge = board.gauge("Temperature", min=0, max=50, unit="°C", color="red")  # A red half-circle gauge
humidity_gauge = board.gauge("Humidity", min=0, max=100, unit="%", color="blue")  # A blue half-circle gauge
history = board.chart("Humidity over time", unit="%")  # A line chart of the last 60 values, with times below
note = board.text("Status (warns above {}°C)".format(HOT))  # One line of text; the title gives the condition
board.start()

last_read = time.ticks_ms() - READ_MS
while True:
    board.check()
    # Read the sensor every 3 s by checking the time; board.check() keeps running in between, so the phone still gets answers
    if time.ticks_diff(time.ticks_ms(), last_read) >= READ_MS:
        last_read = time.ticks_ms()
        try:
            sensor.measure()
            temp = sensor.temperature()
            humidity = sensor.humidity()
            temp_gauge.set(temp)
            humidity_gauge.set(humidity)
            history.set(humidity)
            if temp > HOT:
                note.set("Too hot: {}°C, above {}°C, open a window".format(temp, HOT))
            else:
                note.set("Temperature normal: {}°C, not above {}°C".format(temp, HOT))
            print("temp:", temp, "°C  humidity:", humidity, "%")
        except OSError:  # A wiring problem ends up here
            note.set("Reading failed, check the wiring")
            print("Reading failed, check the wiring")
    time.sleep_ms(20)
