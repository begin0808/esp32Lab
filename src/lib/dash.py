# dash.py｜ESP32 Lab 手機儀表板工具
# 網站會在上傳用到 dash 的程式時，自動把這個檔案存到板子的 /lib。內容和網站上的版本不同時，會換回網站上的版本
# 用法請看範例 27～29，或說明頁的「手機儀表板」
import binascii
import json
import machine
import network
import time
from umqtt.simple import MQTTClient

PAGE = "{{DASH_PAGE}}"  # 手機儀表板的網址，網站存檔時會填入
SEND_GAP_MS = 500  # 同一個元件最快每 0.5 秒送一次，才不會塞爆公用伺服器
RETRY_MS = 5000  # 斷線後 5 秒再重新連線
PING_MS = 30000  # 每 30 秒通知伺服器一次，開發板還在線上
MAX_WIDGETS = 30

# 元件種類和它在 MQTT 主題裡的代號
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
        self.due = False  # 有新的值還沒送到手機
        self.keep_due = False  # 板子自己改了開關或滑桿，還沒記到伺服器上
        self.sent_at = time.ticks_add(time.ticks_ms(), -SEND_GAP_MS)
        self.sent = None  # 上次送到手機的內容

    def set(self, value):  # 把值送到手機
        if self.kind == "button":
            raise ValueError("按鈕是從手機按的，不能用 set()")
        if self.kind == "slider":
            value = self.clamp(value)
        self.value = value
        if self.kind != "chart" and self.payload() == self.sent:
            return  # 和上次送出的一樣就不再送。折線圖例外，每次都是一個新的點
        self.due = True
        # 板子自己改了開關或滑桿，也要記在伺服器上，重新開機後才會一樣
        self.keep_due = self.kind in INPUTS

    def pressed(self):  # 按鈕從上次檢查到現在，有沒有被按過
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

    def receive(self, text):  # 手機傳來的操作
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
        self.due = True  # 回報給手機，手機才知道板子收到了

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

    # 板子 → 手機的元件
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

    # 手機 → 板子的元件
    def switch(self, label):
        return self.add("switch", label, {})

    def button(self, label):
        return self.add("button", label, {})

    def slider(self, label, min=0, max=100, unit=""):
        return self.add("slider", label, {"min": int(min), "max": int(max), "u": unit})

    def add(self, kind, label, options):
        if len(self.widgets) >= MAX_WIDGETS:
            raise ValueError("元件太多了，最多 {} 個".format(MAX_WIDGETS))
        widget = Widget(self, kind, str(label), options)
        self.widgets.append(widget)
        self.layout_due = True
        return widget

    def start(self):  # 連上 Wi-Fi 和 MQTT 伺服器，並印出手機要開的網址
        try:
            self.connect()
        except Exception as error:
            print("連線失敗，5 秒後重試：", error)
            self.drop()

    def check(self):  # 迴圈裡每次都要呼叫：收手機的操作、送出新的值，斷線時自動重連
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
            print("連線中斷，5 秒後重試：", error)
            self.drop()

    def connect_wifi(self):
        wlan = network.WLAN(network.STA_IF)
        wlan.active(True)
        if wlan.isconnected():
            return
        wlan.connect(self.ssid, self.password)
        print("正在連線 Wi-Fi", end="")
        for _ in range(40):  # 最多等 20 秒
            if wlan.isconnected():
                print()
                return
            print(".", end="")
            time.sleep(0.5)
        print()
        raise RuntimeError("Wi-Fi 連線失敗，請檢查名稱、密碼，以及是否為 2.4GHz")

    def connect(self):
        self.connect_wifi()
        client_id = b"esp32-dash-" + binascii.hexlify(machine.unique_id())
        client = MQTTClient(client_id, self.broker, port=self.port, user=self.user, password=self.mqtt_password, keepalive=60)
        client.set_callback(self.on_message)
        # 開發板斷線時，由伺服器通知手機
        client.set_last_will((self.base + "state").encode(), b"offline", retain=True)
        client.connect()
        self.client = client
        client.subscribe((self.base + "in/+").encode())
        # 伺服器會先送來上次保留的開關和滑桿狀態，等一下把它們收完
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
        print("已連上 MQTT 伺服器")
        print("手機儀表板：", PAGE + "?ch=" + self.topic)

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
                # retain 讓伺服器保留最新的值，手機晚一點才打開也看得到
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
