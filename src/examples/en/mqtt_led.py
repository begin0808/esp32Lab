# Example 17 | Voice-controlled LED (MQTT): open the voice control page on a phone or computer and say "on", "off" or "blink"
# Wiring: LED long leg to GPIO 18, short leg through a 220Ω resistor to GND
# The Wi-Fi must reach the internet. Commands pass through a public MQTT broker, so do not control anything important
import binascii
import machine
import network
import time
from machine import Pin
from umqtt.simple import MQTTClient

# Change these to your Wi-Fi name and password (ESP32 only supports 2.4GHz)
SSID = "YOUR_WIFI_SSID"
PASSWORD = "YOUR_WIFI_PASSWORD"

LED_PIN = 18

# The MQTT topic name must match the one on the voice control page. Use a different name for each board
TOPIC_NAME = "{{CHANNEL}}"
VOICE_PAGE = "{{VOICE_PAGE}}"

# If you change the MQTT broker, set the same one in the voice control page's advanced settings
# This uses the unencrypted TCP port (usually 1883); the voice control page uses the WSS port
BROKER = "broker.emqx.io"
MQTT_PORT = 1883
# Fill these in only if the broker needs a login. Port 1883 is not encrypted, so use a password made only for this broker
MQTT_USER = ""
MQTT_PASSWORD = ""

# The topic for receiving commands
COMMAND_TOPIC = "esp32-mp-class/{}/command".format(TOPIC_NAME).encode()
# The topic for reporting the state
STATE_TOPIC = "esp32-mp-class/{}/state".format(TOPIC_NAME).encode()

led = Pin(LED_PIN, Pin.OUT, value=0)
mode = "off"
# Report to the voice page when the state changes
need_report = True


def connect_wifi():
    wlan = network.WLAN()  # Create the Wi-Fi connection object
    wlan.active(True)  # Turn Wi-Fi on
    if wlan.isconnected():
        return
    # Start connecting, which takes a moment
    wlan.connect(SSID, PASSWORD)
    print("Connecting to Wi-Fi", end="")
    for _ in range(40):  # Wait up to 40 times 0.5 s, 20 s in total
        if wlan.isconnected():
            print()
            return
        print(".", end="")
        time.sleep(0.5)
    raise RuntimeError("Wi-Fi connection failed. Check the name, the password, and that the network is 2.4GHz")


def on_message(topic, message):  # Runs when an MQTT message arrives
    global mode, need_report
    command = message.decode()
    if command in ("on", "off", "blink"):
        mode = command
        if mode != "blink":
            led.value(1 if mode == "on" else 0)
        need_report = True


def connect_mqtt():
    # Use the chip's serial number, unique to each board
    client_id = b"esp32-" + binascii.hexlify(machine.unique_id())
    client = MQTTClient(client_id, BROKER, port=MQTT_PORT, user=MQTT_USER, password=MQTT_PASSWORD, keepalive=60)
    # Say what to do when a message arrives
    client.set_callback(on_message)
    # When the board drops off, the broker tells the voice control page
    client.set_last_will(STATE_TOPIC, b"offline", retain=True)
    client.connect()
    # Subscribe so that commands arrive
    client.subscribe(COMMAND_TOPIC)
    print("Connected to the MQTT broker")
    print("Voice control page:", VOICE_PAGE)
    print("MQTT topic name:", TOPIC_NAME)
    return client


def serve(client):
    global need_report
    need_report = True
    last_blink = last_ping = time.ticks_ms()
    while True:
        client.check_msg()  # Check for a message without waiting
        if need_report:
            # retain makes the server keep the latest state
            client.publish(STATE_TOPIC, mode.encode(), retain=True)
            print("LED mode:", mode)
            need_report = False

        # Timing without pausing, so messages keep arriving
        now = time.ticks_ms()
        if mode == "blink" and time.ticks_diff(now, last_blink) >= 500:
            led.value(not led.value())
            last_blink = now
        if time.ticks_diff(now, last_ping) >= 30000:
            # Tell the server regularly that the board is still there
            client.ping()
            last_ping = now
        time.sleep_ms(20)


while True:
    try:
        connect_wifi()
        serve(connect_mqtt())
    # Do not stop on a lost connection; reconnect shortly
    except Exception as error:
        print("Connection lost, retrying in 5 seconds:", error)
        time.sleep(5)
