# dash.py | ESP32 Lab phone dashboard helper
# When you upload a program that uses dash, the site saves this file to the board's /lib by itself.
# If the file differs from the site's version, the site puts its own version back
# See examples 27-29, or "Phone dashboard" on the help page
import binascii
import json
import machine
import network
import time
from umqtt.simple import MQTTClient

PAGE = "{{DASH_PAGE}}"  # The phone dashboard's address, filled in by the site when it saves this file
SEND_GAP_MS = 500  # Each widget sends at most every 0.5 s, so the public broker is not flooded
RETRY_MS = 5000  # Reconnect 5 s after losing the connection
PING_MS = 30000  # Tell the broker every 30 s that the board is still online
MAX_WIDGETS = 30

# Widget kinds and their letter in MQTT topics
KINDS = {"value": "v", "gauge": "g", "chart": "c", "led": "l", "text": "t", "switch": "w", "button": "b", "slider": "r"}
INPUTS = ("switch", "button", "slider")


class Widget:
    def __init__(self, board, kind, label, options):
        self.board = board
        self.kind = kind
        self.id = str(len(board.widgets)) + KINDS[kind]
        self.label = label
        self.options = options
        if kind in ("switch", "led"):
            self.value = False
        elif kind == "slider":
            self.value = options["min"]
        else:
            self.value = None
        self.presses = 0
        self.due = False  # A new value has not reached the phone yet
        self.keep_due = False  # The board changed a switch or slider, and the broker does not know yet
        self.sent_at = time.ticks_add(time.ticks_ms(), -SEND_GAP_MS)
        self.sent = None  # What the phone got last time

    def set(self, value):  # Sends a value to the phone
        if self.kind == "button":
            raise ValueError("buttons are pressed on the phone, so they have no set()")
        if self.kind == "slider":
            value = self.clamp(value)
        self.value = value
        if self.kind != "chart" and self.payload() == self.sent:
            return  # Nothing new to send. Charts are different: every value is a new point
        self.due = True
        # When the board changes a switch or slider, the broker keeps it too, so it stays the same after a restart
        self.keep_due = self.kind in INPUTS

    def pressed(self):  # Whether the button was pressed since the last check
        if self.presses:
            self.presses = 0
            return True
        return False

    def clamp(self, value):
        low = self.options["min"]
        high = self.options["max"]
        return min(high, max(low, int(value)))

    def payload(self):
        if self.kind in ("switch", "led"):
            return "1" if self.value else "0"
        if self.value is None:
            return ""
        if isinstance(self.value, float):
            return str(round(self.value, 2))
        return str(self.value)

    def receive(self, text):  # Something done on the phone
        if self.kind == "switch":
            self.value = text == "1"
        elif self.kind == "slider":
            try:
                self.value = self.clamp(float(text))
            except ValueError:
                return
        elif self.kind == "button":
            self.presses += 1
            return
        else:
            return
        self.due = True  # Report back, so the phone knows the board got it

    def describe(self):
        item = {"id": self.id, "t": self.kind, "l": self.label}
        item.update(self.options)
        return item


class Dashboard:
    def __init__(self, topic, ssid, password, broker="broker.emqx.io", port=1883, user="", mqtt_password=""):
        self.topic = topic
        self.ssid = ssid
        self.password = password
        self.broker = broker
        self.port = port
        self.user = user
        self.mqtt_password = mqtt_password
        self.base = "esp32-mp-class/{}/dash/".format(topic)
        self.widgets = []
        self.client = None
        self.layout_due = True
        self.retry_at = time.ticks_ms()
        self.ping_at = time.ticks_ms()

    # Widgets from the board to the phone
    def value(self, label, unit=""):
        return self.add("value", label, {"u": unit})

    def gauge(self, label, min=0, max=100, unit="", color="green"):
        return self.add("gauge", label, {"min": min, "max": max, "u": unit, "c": color})

    def chart(self, label, unit=""):
        return self.add("chart", label, {"u": unit})

    def led(self, label, color="green"):
        return self.add("led", label, {"c": color})

    def text(self, label):
        return self.add("text", label, {})

    # Widgets from the phone to the board
    def switch(self, label):
        return self.add("switch", label, {})

    def button(self, label):
        return self.add("button", label, {})

    def slider(self, label, min=0, max=100, unit=""):
        return self.add("slider", label, {"min": int(min), "max": int(max), "u": unit})

    def add(self, kind, label, options):
        if len(self.widgets) >= MAX_WIDGETS:
            raise ValueError("too many widgets, the most is {}".format(MAX_WIDGETS))
        widget = Widget(self, kind, str(label), options)
        self.widgets.append(widget)
        self.layout_due = True
        return widget

    def start(self):  # Joins Wi-Fi and the MQTT broker, and prints the address to open on the phone
        try:
            self.connect()
        except Exception as error:
            print("Could not connect, retrying in 5 s:", error)
            self.drop()

    def check(self):  # Call this every time round the loop: it reads the phone, sends new values and reconnects
        if self.client is None:
            if time.ticks_diff(time.ticks_ms(), self.retry_at) < 0:
                return
            self.start()
            if self.client is None:
                return
        try:
            self.client.check_msg()
            self.send_due()
            now = time.ticks_ms()
            if time.ticks_diff(now, self.ping_at) >= PING_MS:
                self.client.ping()
                self.ping_at = now
        except Exception as error:
            print("Connection lost, retrying in 5 s:", error)
            self.drop()

    def connect_wifi(self):
        wlan = network.WLAN(network.STA_IF)
        wlan.active(True)
        if wlan.isconnected():
            return
        wlan.connect(self.ssid, self.password)
        print("Connecting to Wi-Fi", end="")
        for _ in range(40):  # Wait at most 20 s
            if wlan.isconnected():
                print()
                return
            print(".", end="")
            time.sleep(0.5)
        print()
        raise RuntimeError("Wi-Fi connection failed. Check the name, the password, and that it is 2.4 GHz")

    def connect(self):
        self.connect_wifi()
        client_id = b"esp32-dash-" + binascii.hexlify(machine.unique_id())
        client = MQTTClient(client_id, self.broker, port=self.port, user=self.user, password=self.mqtt_password, keepalive=60)
        client.set_callback(self.on_message)
        # If the board drops off, the broker tells the phone
        client.set_last_will((self.base + "state").encode(), b"offline", retain=True)
        client.connect()
        self.client = client
        client.subscribe((self.base + "in/+").encode())
        # The broker first sends the switch and slider states it kept, so wait for them
        until = time.ticks_add(time.ticks_ms(), 500)
        while time.ticks_diff(until, time.ticks_ms()) > 0:
            client.check_msg()
            time.sleep_ms(20)
        self.publish("state", "online", True)
        self.layout_due = True
        for widget in self.widgets:
            widget.due = widget.kind != "button"
            widget.sent_at = time.ticks_add(time.ticks_ms(), -SEND_GAP_MS)
        self.send_due()
        self.ping_at = time.ticks_ms()
        print("Connected to the MQTT broker")
        print("Phone dashboard:", PAGE + "?ch=" + self.topic)

    def drop(self):
        if self.client:
            try:
                self.client.disconnect()
            except Exception:
                pass
        self.client = None
        self.retry_at = time.ticks_add(time.ticks_ms(), RETRY_MS)

    def publish(self, name, text, retain):
        if self.client:
            self.client.publish((self.base + name).encode(), text.encode(), retain=retain)

    def send_due(self):
        if self.layout_due:
            layout = {"v": 1, "w": [widget.describe() for widget in self.widgets]}
            self.publish("layout", json.dumps(layout), True)
            self.layout_due = False
        now = time.ticks_ms()
        for widget in self.widgets:
            if widget.keep_due:
                self.publish("in/" + widget.id, widget.payload(), True)
                widget.keep_due = False
            if widget.due and time.ticks_diff(now, widget.sent_at) >= SEND_GAP_MS:
                # retain makes the broker keep the newest value, so a phone opened later still sees it
                self.publish("out/" + widget.id, widget.payload(), True)
                widget.due = False
                widget.sent = widget.payload()
                widget.sent_at = now

    def on_message(self, topic, message):
        name = topic.decode()[len(self.base):]
        if not name.startswith("in/"):
            return
        for widget in self.widgets:
            if widget.id == name[3:]:
                widget.receive(message.decode())
                return
