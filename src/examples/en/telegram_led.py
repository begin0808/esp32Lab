# Telegram bot LED: send /on, /off or /status to control the LED; pressing the button notifies your phone
# Wiring: LED through a 220Ω resistor to GPIO 18, short leg to GND; button between GPIO 19 and GND
# The Wi-Fi must reach the internet. For setup steps, see Telegram bot in the help page
# The bot token is the bot's password, so do not project or share it. This example does not verify the server certificate, so do not control anything important
import gc
import json
import network
import requests
import time
from machine import Pin

# Change these to your Wi-Fi name and password (ESP32 only supports 2.4GHz)
SSID = "YOUR_WIFI_SSID"
PASSWORD = "YOUR_WIFI_PASSWORD"

# Create a bot with @BotFather on Telegram to get a bot token
BOT_TOKEN = "YOUR_BOT_TOKEN"
# Leave this empty and upload. Message the bot, the monitor shows your number, then fill it in and upload again
# Only this chat can control the board
CHAT_ID = ""

LED_PIN = 18
BUTTON_PIN = 19
POLL_SECONDS = 2

API_URL = "https://api.telegram.org/bot{}/".format(BOT_TOKEN)

led = Pin(LED_PIN, Pin.OUT, value=0)
button = Pin(BUTTON_PIN, Pin.IN, Pin.PULL_UP)
button_pressed = False
last_press = 0
next_update = None


def on_button(_pin):
    global button_pressed, last_press
    now = time.ticks_ms()
    # Ignore repeats within 200 ms to skip button bounce
    if time.ticks_diff(now, last_press) > 200:
        button_pressed = True
        last_press = now


button.irq(trigger=Pin.IRQ_FALLING, handler=on_button)


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


def call_telegram(method, payload):
    gc.collect()
    # Convert to bytes first so the length that is sent stays correct for any language
    body = json.dumps(payload).encode()
    response = requests.post(API_URL + method, data=body, headers={"Content-Type": "application/json"}, timeout=15)
    try:
        result = response.json()
    finally:
        response.close()
    if not result["ok"]:
        raise RuntimeError("Telegram reported an error: {}".format(result.get("description")))
    return result["result"]


def send_message(text):
    call_telegram("sendMessage", {"chat_id": CHAT_ID, "text": text})


def led_status():
    return "The LED is {}".format("on" if led.value() else "off")


def handle_message(message):
    chat_id = str(message["chat"]["id"])
    if not CHAT_ID:
        print("Your CHAT_ID is", chat_id, ". Put it in the program and upload again")
        return
    if chat_id != CHAT_ID:
        print("Ignored a message from another chat")
        return

    words = message.get("text", "").split()
    # Commands in a group look like /on@bot_name
    command = words[0].split("@")[0].lower() if words else ""
    if command == "/on":
        led.value(1)
        send_message("LED on")
    elif command == "/off":
        led.value(0)
        send_message("LED off")
    elif command == "/status":
        send_message(led_status())
    else:
        send_message("Commands: /on turns the LED on, /off turns it off, /status shows its state")
    print("Command received:", command)


def skip_old_messages():
    """Skip old commands from while the board was offline and start from now."""
    updates = call_telegram("getUpdates", {"offset": -1, "timeout": 0})
    return updates[-1]["update_id"] + 1 if updates else 0


def serve():
    global button_pressed, next_update
    # Skip only once at boot, so commands sent during a brief network drop still run
    if next_update is None:
        next_update = skip_old_messages()
    print("The bot is online. Send it /status on Telegram")
    while True:
        if button_pressed:
            button_pressed = False
            if CHAT_ID:
                send_message("The button was pressed")
                print("Telegram notified")
            else:
                print("CHAT_ID is not set, so no notification was sent")

        updates = call_telegram("getUpdates", {"offset": next_update, "limit": 5, "timeout": 0, "allowed_updates": ["message"]})
        for update in updates:
            # Record progress first, so a failure does not repeat the same command forever
            next_update = update["update_id"] + 1
            if "message" in update:
                handle_message(update["message"])
        time.sleep(POLL_SECONDS)


if "YOUR_" in BOT_TOKEN:
    raise RuntimeError("Change BOT_TOKEN to the bot token from @BotFather first")

while True:
    try:
        connect_wifi()
        serve()
    except Exception as error:
        print("Connection lost, retrying in 5 seconds:", error)
        time.sleep(5)
