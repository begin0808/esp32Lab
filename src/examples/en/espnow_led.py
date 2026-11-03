# Example 25 | ESP-NOW between boards: press the button on any board and every board's LED toggles together
# Wiring: every board as in example 2, button between GPIO 19 and GND; LED through a 220Ω resistor to GPIO 18, short leg to GND
# How to use: upload this same program to two or more boards. They talk directly, with no Wi-Fi password and no addresses to type in
import espnow
import network
import time
from machine import Pin

LED_PIN = 18
BUTTON_PIN = 19
BROADCAST = b"\xff" * 6  # The broadcast address: every board nearby receives it

led = Pin(LED_PIN, Pin.OUT, value=0)
button = Pin(BUTTON_PIN, Pin.IN, Pin.PULL_UP)

wlan = network.WLAN(network.STA_IF)  # ESP-NOW sends through the Wi-Fi radio, without joining any network
wlan.active(True)
wlan.disconnect()  # A Wi-Fi network the board joined before would change its channel, so leave it
wlan.config(channel=1)  # Every board uses channel 1 so they hear each other

esp = espnow.ESPNow()
esp.active(True)
esp.add_peer(BROADCAST)


def mac_text(mac):  # Writes an address as A4:CF:12:34:56:78
    return ":".join("{:02X}".format(b) for b in mac)


def show(state):
    led.value(state)
    print("LED", "on" if state else "off")


print("My MAC address:", mac_text(wlan.config("mac")))
print("Press the button and every board's LED toggles")

last = button.value()
while True:
    now = button.value()
    if last == 1 and now == 0:  # Just pressed
        state = 0 if led.value() else 1
        esp.send(BROADCAST, b"on" if state else b"off")  # Tell the other boards the new state
        show(state)
    last = now

    sender, message = esp.recv(0)  # 0 means do not wait; with no message both are None
    if message:
        print("Message from", mac_text(sender), ":", message.decode())
        show(1 if message == b"on" else 0)
    time.sleep_ms(30)
