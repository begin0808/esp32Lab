# dash.py｜ESP32 Lab 手機儀表板工具
# 網站會在上傳用到 dash 的程式時，自動把這個檔案存到板子的 /lib。內容和網站上的版本不同時，會換回網站上的版本
# 用法請看範例 27～38，或說明頁的「手機儀表板」
import binascii
import gc
import json
import machine
import network
import time
from umqtt.simple import MQTTClient

PAGE = "{{DASH_PAGE}}"  # 手機儀表板的網址，網站存檔時會填入
SEND_GAP_MS = 500  # 同一個元件最快每 0.5 秒送一次，才不會塞爆公用伺服器
RETRY_MS = 5000  # 斷線後 5 秒再重新連線
PING_MS = 30000  # 每 30 秒通知伺服器一次，開發板還在線上
HOLD_MS = 1000  # 方向鍵、搖桿和手機傾斜超過 1 秒沒收到手機的訊息就當作放開，手機斷線時車子才會停
INFO_MS = 10000  # 每 10 秒把 Wi-Fi 訊號、執行時間和剩餘記憶體送到手機
MAX_WIDGETS = 30
MAX_TEXT = 100  # 手機傳來的文字最多保留 100 個字
MAX_COLUMNS = 6  # 紀錄表最多 6 欄
MAX_WAITING = 20  # 紀錄表還沒送出的列最多留 20 列
DIRECTIONS = ("up", "down", "left", "right", "")

# 元件種類和它在 MQTT 主題裡的代號
KINDS = {
    "value": "v", "gauge": "g", "chart": "c", "led": "l", "text": "t", "alert": "a",
    "log": "o",
    "switch": "w", "button": "b", "slider": "r", "color": "h", "pad": "p", "select": "s", "input": "i",
    "number": "n", "tilt": "m", "joystick": "j",
}
# 手機操作、伺服器要記住的元件，板子重新開機後才會回到最後的狀態
KEPT = ("switch", "slider", "color", "select", "input", "number")
# 只會由手機操作、板子不能用 set() 改的元件
PHONE_ONLY = ("button", "pad", "tilt", "joystick")
# 要一直收到手機的訊息才算按著，太久沒收到就回到靜止的元件
HELD = ("pad", "tilt", "joystick")
# 發生時才送、不保留在伺服器上的元件
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
            self.value = []  # 還沒送到手機的列
        else:
            self.value = None
        self.on = False  # 手機傾斜有沒有開啟、搖桿有沒有被按著
        self.presses = 0
        self.fresh = False  # 手機傳來新的文字或數字，還沒被 changed() 讀過
        self.heard_at = time.ticks_ms()  # 方向鍵、搖桿或傾斜最後一次收到手機訊息的時間
        self.due = False  # 有新的值還沒送到手機
        self.keep_due = False  # 板子自己改了開關或滑桿，還沒記到伺服器上
        self.sent_at = time.ticks_add(time.ticks_ms(), -SEND_GAP_MS)
        self.sent = None  # 上次送到手機的內容

    def set(self, value):  # 把值送到手機
        if self.kind in PHONE_ONLY:
            raise ValueError("「{}」是從手機操作的，不能用 set()".format(self.label))
        if self.kind == "log":
            raise ValueError("紀錄表「{}」請用 add() 新增一列".format(self.label))
        if self.kind == "slider":
            value = self.clamp(value)
        elif self.kind == "number":
            value = self.fit(value)
        elif self.kind == "color":
            value = tuple(min(255, max(0, int(part))) for part in value)
        elif self.kind == "select" and value not in self.options["o"]:
            raise ValueError("選單「{}」沒有「{}」這個選項".format(self.label, value))
        elif self.kind == "input":
            value = str(value)[:MAX_TEXT]
        self.value = value
        # 和上次送出的一樣就不再送。折線圖和提醒例外，每次都要送出
        if self.kind not in ("chart", "alert") and self.payload() == self.sent:
            return
        self.due = True
        # 板子自己改了開關、滑桿這類元件，也要記在伺服器上，重新開機後才會一樣
        self.keep_due = self.kind in KEPT

    def send(self, message):  # 提醒用：在手機上跳出提醒
        self.set(str(message))

    def add(self, *values):  # 紀錄表用：新增一列，值的個數要和欄數一樣
        columns = len(self.options["o"])
        if len(values) != columns:
            raise ValueError("紀錄表「{}」有 {} 欄，add() 要給 {} 個值".format(self.label, columns, columns))
        row = []
        for value in values:
            if isinstance(value, float):
                value = round(value, 2)
            elif not (value is None or isinstance(value, (int, str))):
                value = str(value)
            row.append(value)
        self.value.append(row)
        # 送不出去時（例如斷線）只留最新的幾列，記憶體才不會用完
        if len(self.value) > MAX_WAITING:
            self.value.pop(0)
        self.due = True

    @property
    def x(self):  # 搖桿或傾斜的左右，-100（左）～100（右）
        return self.value[0]

    @property
    def y(self):  # 搖桿或傾斜的前後，-100（後）～100（前）
        return self.value[1]

    def pressed(self):  # 按鈕從上次檢查到現在，有沒有被按過
        if self.presses:
            self.presses = 0
            return True
        return False

    def changed(self):  # 文字輸入或數字設定從上次檢查到現在，有沒有收到手機的新值
        if self.fresh:
            self.fresh = False
            return True
        return False

    def clamp(self, value):
        low = self.options["min"]
        high = self.options["max"]
        return min(high, max(low, int(value)))

    def fit(self, value):  # 數字設定：限制在範圍內，並對齊每次加減的量
        low = self.options["min"]
        high = self.options["max"]
        step = self.options["step"]
        value = min(high, max(low, float(value)))
        value = min(high, low + round((value - low) / step) * step)
        if isinstance(low, int) and isinstance(step, int):
            return int(round(value))
        return round(value, 2)

    def rest(self):  # 方向鍵、搖桿和傾斜回到靜止
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

    def receive(self, text):  # 手機傳來的操作
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
            # 手機傳來「左右,前後」，例如 "30,-100"；空字串代表放開或停止
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
        self.info_at = time.ticks_ms()
        self.up_ms = time.ticks_ms()  # 開機到現在的時間
        self.up_at = time.ticks_ms()

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

    def alert(self, label):
        return self.add("alert", label, {})

    def log(self, label, columns):
        columns = [str(column) for column in columns]
        if not 0 < len(columns) <= MAX_COLUMNS:
            raise ValueError("紀錄表「{}」要有 1～{} 欄".format(label, MAX_COLUMNS))
        return self.add("log", label, {"o": columns})

    # 手機 → 板子的元件
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
            raise ValueError("選單「{}」至少要有一個選項".format(label))
        return self.add("select", label, {"o": options})

    def input(self, label):
        return self.add("input", label, {})

    def number(self, label, value=None, min=0, max=100, step=1, unit=""):
        if not min < max or not step > 0:
            raise ValueError("數字設定「{}」的 min 要小於 max，step 要大於 0".format(label))
        widget = self.add("number", label, {"min": min, "max": max, "step": step, "u": unit})
        widget.value = widget.fit(min if value is None else value)
        return widget

    def tilt(self, label):
        return self.add("tilt", label, {})

    def joystick(self, label):
        return self.add("joystick", label, {})

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
            print("連線中斷，5 秒後重試：", error)
            self.drop()

    def release_held(self):  # 手機太久沒傳方向鍵、搖桿或傾斜的訊息，就當作已經放開
        now = time.ticks_ms()
        for widget in self.widgets:
            if widget.kind in HELD and widget.on and time.ticks_diff(now, widget.heard_at) > HOLD_MS:
                widget.rest()

    def send_info(self):  # 把 Wi-Fi 訊號、執行時間和剩餘記憶體送到手機，不會送出 IP 位址
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
            # 按鈕、方向鍵、搖桿和傾斜沒有狀態要回報；提醒和紀錄表只在發生時送出
            if widget.kind not in PHONE_ONLY + EVENTS:
                widget.due = True
            widget.sent_at = time.ticks_add(time.ticks_ms(), -SEND_GAP_MS)
        self.send_due()
        self.send_info()
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
        # 斷線時收不到手機的訊息，方向鍵、搖桿和傾斜馬上放開，車子才會停
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
                # retain 讓伺服器保留最新的值，手機晚一點才打開也看得到；提醒和紀錄表不保留，舊的才不會重複出現
                self.publish("out/" + widget.id, widget.payload(), widget.kind not in EVENTS)
                widget.due = False
                widget.sent = widget.payload()
                widget.sent_at = now
                if widget.kind == "log":
                    widget.value = []  # 這幾列已經送出

    def on_message(self, topic, message):
        name = topic.decode()[len(self.base):]
        if not name.startswith("in/"):
            return
        for widget in self.widgets:
            if widget.id == name[3:]:
                widget.receive(message.decode())
                return
