# dash.py | ESP32 Lab phone dashboard helper
# When you upload a program that uses dash, the site saves this file to the board's /lib by itself.
# If the file differs from the site's version, the site puts its own version back
# See examples 27-38, or "Phone dashboard" on the help page
import binascii
import gc
import json
import machine
import network
import time
from umqtt.simple import MQTTClient

PAGE = "{{DASH_PAGE}}"  # The phone dashboard's address, filled in by the site when it saves this file
SEND_GAP_MS = 500  # Each widget sends at most every 0.5 s, so the public broker is not flooded
RETRY_MS = 5000  # Reconnect 5 s after losing the connection
PING_MS = 30000  # Tell the broker every 30 s that the board is still online
HOLD_MS = 1000  # A direction pad, joystick or tilt with no word from the phone for 1 s counts as released, so a car stops if the phone drops off
INFO_MS = 10000  # Send the Wi-Fi signal, running time and free memory to the phone every 10 s
MAX_WIDGETS = 30
MAX_TEXT = 100  # Keep at most 100 characters of text from the phone
MAX_COLUMNS = 6  # A log has at most 6 columns
MAX_WAITING = 20  # Keep at most 20 log rows that have not been sent yet
DIRECTIONS = ("up", "down", "left", "right", "")

# Widget kinds and their letter in MQTT topics
KINDS = {
    "value": "v", "gauge": "g", "chart": "c", "led": "l", "text": "t", "alert": "a",
    "log": "o",
    "switch": "w", "button": "b", "slider": "r", "color": "h", "pad": "p", "select": "s", "input": "i",
    "number": "n", "tilt": "m", "joystick": "j",
}
# Widgets set on the phone that the broker remembers, so the board gets their last state after a restart
KEPT = ("switch", "slider", "color", "select", "input", "number")
# Widgets only the phone can use; the board has no set() for them
PHONE_ONLY = ("button", "pad", "tilt", "joystick")
# Widgets that count as held only while the phone keeps sending, and go back to rest when it stops
HELD = ("pad", "tilt", "joystick")
# Widgets sent only when something happens, and never kept by the broker
EVENTS = ("alert", "log")


class Widget:
    def __init__(self, board, kind, label, options):
        self.board = board
        self.kind = kind
        self.id = str(len(board.widgets)) + KINDS[kind]
        self.label = label
        self.options = options
        if kind in ("switch", "led"):
            self.value = False
        elif kind in ("slider", "number"):
            self.value = options["min"]
        elif kind == "color":
            self.value = (255, 255, 255)
        elif kind == "select":
            self.value = options["o"][0]
        elif kind in ("pad", "input"):
            self.value = ""
        elif kind in ("tilt", "joystick"):
            self.value = (0, 0)
        elif kind == "log":
            self.value = []  # Rows that have not reached the phone yet
        else:
            self.value = None
        self.on = False  # Whether tilt is turned on, or the joystick is being held
        self.presses = 0
        self.fresh = False  # New text or a new number from the phone that changed() has not reported yet
        self.heard_at = time.ticks_ms()  # When the direction pad, joystick or tilt last heard from the phone
        self.due = False  # A new value has not reached the phone yet
        self.keep_due = False  # The board changed a switch or slider, and the broker does not know yet
        self.sent_at = time.ticks_add(time.ticks_ms(), -SEND_GAP_MS)
        self.sent = None  # What the phone got last time

    def set(self, value):  # Sends a value to the phone
        if self.kind in PHONE_ONLY:
            raise ValueError("{} is used on the phone, so it has no set()".format(self.label))
        if self.kind == "log":
            raise ValueError("use add() to add a row to the log {}".format(self.label))
        if self.kind == "slider":
            value = self.clamp(value)
        elif self.kind == "number":
            value = self.fit(value)
        elif self.kind == "color":
            value = tuple(min(255, max(0, int(part))) for part in value)
        elif self.kind == "select" and value not in self.options["o"]:
            raise ValueError("the menu {} has no option {}".format(self.label, value))
        elif self.kind == "input":
            value = str(value)[:MAX_TEXT]
        self.value = value
        # Nothing new to send. Charts and alerts are different: every value goes out
        if self.kind not in ("chart", "alert") and self.payload() == self.sent:
            return
        self.due = True
        # When the board changes a switch, slider or the like, the broker keeps it too, so it stays the same after a restart
        self.keep_due = self.kind in KEPT

    def send(self, message):  # For alerts: pops up an alert on the phone
        self.set(str(message))

    def add(self, *values):  # For logs: adds a row, with one value for each column
        columns = len(self.options["o"])
        if len(values) != columns:
            raise ValueError("the log {} has {} columns, so add() needs {} values".format(self.label, columns, columns))
        row = []
        for value in values:
            if isinstance(value, float):
                value = round(value, 2)
            elif not (value is None or isinstance(value, (int, str))):
                value = str(value)
            row.append(value)
        self.value.append(row)
        # If rows cannot be sent (for example while offline), keep only the newest few so memory does not run out
        if len(self.value) > MAX_WAITING:
            self.value.pop(0)
        self.due = True

    @property
    def x(self):  # Left and right of a joystick or tilt, -100 (left) to 100 (right)
        return self.value[0]

    @property
    def y(self):  # Back and forward of a joystick or tilt, -100 (back) to 100 (forward)
        return self.value[1]

    def pressed(self):  # Whether the button was pressed since the last check
        if self.presses:
            self.presses = 0
            return True
        return False

    def changed(self):  # Whether new text or a new number arrived from the phone since the last check
        if self.fresh:
            self.fresh = False
            return True
        return False

    def clamp(self, value):
        low = self.options["min"]
        high = self.options["max"]
        return min(high, max(low, int(value)))

    def fit(self, value):  # For number settings: keeps the value in range and on a whole step
        low = self.options["min"]
        high = self.options["max"]
        step = self.options["step"]
        value = min(high, max(low, float(value)))
        value = min(high, low + round((value - low) / step) * step)
        if isinstance(low, int) and isinstance(step, int):
            return int(round(value))
        return round(value, 2)

    def rest(self):  # A direction pad, joystick or tilt goes back to rest
        if self.kind == "pad":
            self.value = ""
        else:
            self.value = (0, 0)
        self.on = False

    def payload(self):
        if self.kind in ("switch", "led"):
            return "1" if self.value else "0"
        if self.kind == "color":
            return "#{:02x}{:02x}{:02x}".format(*self.value)
        if self.kind == "log":
            return json.dumps(self.value)
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
        elif self.kind == "number":
            try:
                self.value = self.fit(text)
            except ValueError:
                return
            self.fresh = True
        elif self.kind == "color":
            if len(text) != 7 or text[0] != "#":
                return
            try:
                self.value = (int(text[1:3], 16), int(text[3:5], 16), int(text[5:7], 16))
            except ValueError:
                return
        elif self.kind == "select":
            if text not in self.options["o"]:
                return
            self.value = text
        elif self.kind == "input":
            self.value = text[:MAX_TEXT]
            self.fresh = True
        elif self.kind == "button":
            self.presses += 1
            return
        elif self.kind == "pad":
            if text in DIRECTIONS:
                self.value = text
                self.on = text != ""
                self.heard_at = time.ticks_ms()
            return
        elif self.kind in ("tilt", "joystick"):
            # The phone sends left-right and back-forward, such as "30,-100"; an empty text means released or stopped
            if text == "":
                self.rest()
                self.heard_at = time.ticks_ms()
                return
            parts = text.split(",")
            try:
                x, y = int(parts[0]), int(parts[1])
            except (ValueError, IndexError):
                return
            if len(parts) != 2:
                return
            self.value = (min(100, max(-100, x)), min(100, max(-100, y)))
            self.on = True
            self.heard_at = time.ticks_ms()
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
        self.info_at = time.ticks_ms()
        self.up_ms = time.ticks_ms()  # Time since the board started
        self.up_at = time.ticks_ms()

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

    def alert(self, label):
        return self.add("alert", label, {})

    def log(self, label, columns):
        columns = [str(column) for column in columns]
        if not 0 < len(columns) <= MAX_COLUMNS:
            raise ValueError("the log {} needs 1 to {} columns".format(label, MAX_COLUMNS))
        return self.add("log", label, {"o": columns})

    # Widgets from the phone to the board
    def switch(self, label):
        return self.add("switch", label, {})

    def button(self, label):
        return self.add("button", label, {})

    def slider(self, label, min=0, max=100, unit=""):
        return self.add("slider", label, {"min": int(min), "max": int(max), "u": unit})

    def color(self, label):
        return self.add("color", label, {})

    def pad(self, label):
        return self.add("pad", label, {})

    def select(self, label, options):
        options = [str(option) for option in options]
        if not options:
            raise ValueError("the menu {} needs at least one option".format(label))
        return self.add("select", label, {"o": options})

    def input(self, label):
        return self.add("input", label, {})

    def number(self, label, value=None, min=0, max=100, step=1, unit=""):
        if not min < max or not step > 0:
            raise ValueError("the number setting {} needs min below max and a step above 0".format(label))
        widget = self.add("number", label, {"min": min, "max": max, "step": step, "u": unit})
        widget.value = widget.fit(min if value is None else value)
        return widget

    def tilt(self, label):
        return self.add("tilt", label, {})

    def joystick(self, label):
        return self.add("joystick", label, {})

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
        self.release_held()
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
            if time.ticks_diff(now, self.info_at) >= INFO_MS:
                self.send_info()
        except Exception as error:
            print("Connection lost, retrying in 5 s:", error)
            self.drop()

    def release_held(self):  # A direction pad, joystick or tilt the phone has not mentioned for too long counts as released
        now = time.ticks_ms()
        for widget in self.widgets:
            if widget.kind in HELD and widget.on and time.ticks_diff(now, widget.heard_at) > HOLD_MS:
                widget.rest()

    def send_info(self):  # Sends the Wi-Fi signal, running time and free memory to the phone, never the IP address
        now = time.ticks_ms()
        self.up_ms += time.ticks_diff(now, self.up_at)
        self.up_at = now
        try:
            signal = network.WLAN(network.STA_IF).status("rssi")
        except Exception:
            signal = None
        gc.collect()
        info = {"r": signal, "u": self.up_ms // 1000, "m": gc.mem_free()}
        self.publish("info", json.dumps(info), True)
        self.info_at = now

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
            # Buttons, direction pads, joysticks and tilt have no state to report; alerts and logs go out only when something happens
            if widget.kind not in PHONE_ONLY + EVENTS:
                widget.due = True
            widget.sent_at = time.ticks_add(time.ticks_ms(), -SEND_GAP_MS)
        self.send_due()
        self.send_info()
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
        # Without a connection the phone cannot be heard, so direction pads, joysticks and tilt are released at once and a car stops
        for widget in self.widgets:
            if widget.kind in HELD:
                widget.rest()

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
                # retain makes the broker keep the newest value, so a phone opened later still sees it; alerts and logs are not kept, so old ones never show up again
                self.publish("out/" + widget.id, widget.payload(), widget.kind not in EVENTS)
                widget.due = False
                widget.sent = widget.payload()
                widget.sent_at = now
                if widget.kind == "log":
                    widget.value = []  # These rows have been sent

    def on_message(self, topic, message):
        name = topic.decode()[len(self.base):]
        if not name.startswith("in/"):
            return
        for widget in self.widgets:
            if widget.id == name[3:]:
                widget.receive(message.decode())
                return
