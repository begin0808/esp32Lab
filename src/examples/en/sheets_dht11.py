# Log DHT11 data to Google Sheets: adds a row of temperature and humidity every minute
# Wiring: DHT11 VCC to 3V3, GND to GND, DATA to GPIO 4
# The Wi-Fi must reach the internet. For setup steps, see Google Sheets in the help page
# Anyone with the URL can write to the sheet, so do not project or share it. This example does not verify the server certificate, so do not store important data
import dht
import gc
import network
import requests
import time
from machine import Pin

# Change these to your Wi-Fi name and password (ESP32 only supports 2.4GHz)
SSID = "YOUR_WIFI_SSID"
PASSWORD = "YOUR_WIFI_PASSWORD"

# The URL you get after deploying the Apps Script, ending in /exec
SCRIPT_URL = "YOUR_SCRIPT_URL"

DHT_PIN = 4
SEND_SECONDS = 60

sensor = dht.DHT11(Pin(DHT_PIN))


def connect_wifi():
    wlan = network.WLAN()
    wlan.active(True)
    if wlan.isconnected():
        return
    wlan.connect(SSID, PASSWORD)
    print("Connecting to Wi-Fi", end="")
    for _ in range(40):
        if wlan.isconnected():
            print()
            return
        print(".", end="")
        time.sleep(0.5)
    raise RuntimeError("Wi-Fi connection failed. Check the name, the password, and that the network is 2.4GHz")


def send_reading(temperature, humidity):
    gc.collect()
    url = "{}?temp={}&hum={}".format(SCRIPT_URL, temperature, humidity)
    response = requests.get(url, timeout=30)
    try:
        # Read only the first few characters: with wrong permissions, Google returns a login page too big for memory
        reply = bytes(response.raw.read(16))
        status = response.status_code
    finally:
        response.close()
    if status != 200 or reply != b"ok":
        raise RuntimeError("Google did not return ok. Check that access was set to 'Anyone' when deploying")


if "YOUR_" in SCRIPT_URL:
    raise RuntimeError("Change SCRIPT_URL to your Apps Script URL first")

while True:
    try:
        connect_wifi()
        sensor.measure()
        temperature = sensor.temperature()
        humidity = sensor.humidity()
        print("Temperature:", temperature, "°C  Humidity:", humidity, "%")
        send_reading(temperature, humidity)
        print("Saved to Google Sheets")
    except Exception as error:
        print("Could not save this time, will try again next time:", error)
    time.sleep(SEND_SECONDS)
