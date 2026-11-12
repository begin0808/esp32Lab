# Example 36 | Temperature and humidity log: adds a row of temperature and humidity at regular times, then download it as CSV on the phone
# Wiring: DHT11 VCC to 3V3, GND to GND, DATA to GPIO 4
# How to use: after uploading, scan the QR code next to the monitor with a phone to open the dashboard. Wi-Fi must reach the internet
# The log lives on the phone page and only collects rows while the page is open; reloading or closing it clears the log, so press "Download CSV" first
# Try this: press "Record now", breathe on the sensor, press it again, and compare the humidity in the two rows
import time
import dash
import dht
from machine import Pin

# Change these to your Wi-Fi name and password (the ESP32 only supports 2.4 GHz)
SSID = "YOUR_WIFI_SSID"
PASSWORD = "YOUR_WIFI_PASSWORD"

DHT_PIN = 4

# MQTT topic name: give each board its own. Enter the same name on the phone dashboard
TOPIC_NAME = "{{CHANNEL}}"

sensor = dht.DHT11(Pin(DHT_PIN))

board = dash.Dashboard(TOPIC_NAME, SSID, PASSWORD)
table = board.log("Temperature and humidity", ["Temperature (°C)", "Humidity (%)"])  # board -> phone: a log; the phone adds the time
every = board.number("Record every", value=10, min=5, max=60, step=5, unit="s")  # phone -> board: a number setting
now_button = board.button("Record now")  # phone -> board: a button
board.start()


def record():  # Reads the sensor once and adds a row to the log
    try:
        sensor.measure()
        temp = sensor.temperature()
        humidity = sensor.humidity()
    except OSError:  # Ends up here when the wiring is wrong, or the sensor is read too fast
        print("Could not read the sensor. Check the wiring")
        return
    table.add(temp, humidity)  # Values in the same order as the columns
    print("Recorded: temperature", temp, "°C  humidity", humidity, "%")


last_record = time.ticks_ms()
while True:
    board.check()
    # When the time is up, or "Record now" was pressed on the phone, add a row
    if now_button.pressed() or time.ticks_diff(time.ticks_ms(), last_record) >= every.value * 1000:
        last_record = time.ticks_ms()
        record()
    time.sleep_ms(20)
