"""Tests dash.py on CPython, with fake MicroPython modules: a clock that only moves when told, Wi-Fi and MQTT."""
import json
import os
import sys
import types
import unittest

# Loading dash.py must not leave a __pycache__ folder next to the site's source.
sys.dont_write_bytecode = True

HERE =os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))


class Clock:
    now = 0


def ticks_ms():
    return Clock.now


def ticks_add(ticks, delta):
    return ticks + delta


def ticks_diff(a, b):
    return a - b


def sleep(seconds):
    Clock.now += int(seconds * 1000)


def sleep_ms(ms):
    Clock.now += ms


class FakeWlan:
    connected = True

    def __init__(self, *args):
        pass

    def active(self, *args):
        return True

    def isconnected(self):
        return FakeWlan.connected

    def connect(self, ssid, password):
        pass

    def status(self, name):
        return -55 if name == "rssi" else 0


class FakeClient:
    """Plays the broker: keeps retained messages and hands the board what it subscribed to."""

    instances = []
    retained = {}
    fail_connect = False

    def __init__(self, client_id, server, port=0, user=None, password=None, keepalive=0):
        self.server = server
        self.published = []
        self.inbox = []
        self.callback = None
        self.will = None
        self.broken = False
        FakeClient.instances.append(self)

    def set_callback(self, callback):
        self.callback = callback

    def set_last_will(self, topic, message, retain=False):
        self.will = (topic, message, retain)

    def connect(self):
        if FakeClient.fail_connect:
            raise OSError("ECONNREFUSED")

    def subscribe(self, topic):
        prefix = topic.decode().rstrip("+")
        for name, payload in FakeClient.retained.items():
            if name.startswith(prefix):
                self.inbox.append((name.encode(), payload.encode()))

    def check_msg(self):
        if self.broken:
            raise OSError("ECONNRESET")
        while self.inbox:
            self.callback(*self.inbox.pop(0))

    def publish(self, topic, message, retain=False):
        self.published.append((topic.decode(), message.decode(), retain))
        if retain:
            FakeClient.retained[topic.decode()] = message.decode()

    def ping(self):
        pass

    def disconnect(self):
        pass


def install_fakes():
    sys.modules["time"] = types.SimpleNamespace(ticks_ms=ticks_ms, ticks_add=ticks_add, ticks_diff=ticks_diff, sleep=sleep, sleep_ms=sleep_ms)
    sys.modules["machine"] = types.SimpleNamespace(unique_id=lambda: b"\x01\x02")
    sys.modules["network"] = types.SimpleNamespace(WLAN=FakeWlan, STA_IF=0)
    umqtt = types.ModuleType("umqtt")
    umqtt.simple = types.SimpleNamespace(MQTTClient=FakeClient)
    sys.modules["umqtt"] = umqtt
    sys.modules["umqtt.simple"] = umqtt.simple
    sys.modules["gc"] = types.SimpleNamespace(collect=lambda: None, mem_free=lambda: 123456)


def load_dash(language):
    import importlib.util

    path = os.path.join(ROOT, "src", "lib", *(["en"] if language == "en" else []), "dash.py")
    spec = importlib.util.spec_from_file_location("dash_" + language, path)
    module = importlib.util.module_from_spec(spec)
    real = {name: sys.modules.get(name) for name in ("time", "gc")}
    install_fakes()
    try:
        spec.loader.exec_module(module)
    finally:
        for name, original in real.items():
            if original is not None:
                sys.modules[name] = original
    return module


BASE = "esp32-mp-class/room1/dash/"


class DashTests(unittest.TestCase):
    language = "zh"

    def setUp(self):
        Clock.now = 1000
        FakeClient.instances = []
        FakeClient.retained = {}
        FakeClient.fail_connect = False
        FakeWlan.connected = True
        self.dash = load_dash(self.language)

    def board(self):
        return self.dash.Dashboard("room1", "ssid", "secret")

    def client(self):
        return FakeClient.instances[-1]

    def sent(self, name):
        return [payload for topic, payload, _ in self.client().published if topic == BASE + name]

    def test_publishes_the_layout_and_marks_the_board_online(self):
        board = self.board()
        board.gauge("溫度", min=0, max=50, unit="°C", color="red")
        board.switch("LED")
        board.start()
        layout = json.loads(FakeClient.retained[BASE + "layout"])
        self.assertEqual(layout["v"], 1)
        self.assertEqual(
            layout["w"],
            [{"id": "0g", "t": "gauge", "l": "溫度", "min": 0, "max": 50, "u": "°C", "c": "red"}, {"id": "1w", "t": "switch", "l": "LED"}],
        )
        self.assertEqual(FakeClient.retained[BASE + "state"], "online")
        self.assertEqual(self.client().will, ((BASE + "state").encode(), b"offline", True))

    def test_clears_old_values_and_reports_inputs_when_it_starts(self):
        FakeClient.retained[BASE + "out/0v"] = "99"
        board = self.board()
        board.value("濕度")
        board.switch("LED")
        board.start()
        # An empty retained message removes the old program's value from the broker.
        self.assertEqual(self.sent("out/0v"), [""])
        self.assertEqual(self.sent("out/1w"), ["0"])

    def test_sends_a_value_at_most_every_half_second(self):
        board = self.board()
        temp = board.chart("溫度")
        board.start()
        Clock.now += 500
        for value in range(10):
            temp.set(value)
            board.check()
            Clock.now += 20
        # The first value goes at once, the rest wait, and only the newest of them is sent.
        self.assertEqual(self.sent("out/0c"), ["", "0"])
        Clock.now += 500
        board.check()
        self.assertEqual(self.sent("out/0c"), ["", "0", "9"])
        board.check()
        self.assertEqual(self.sent("out/0c"), ["", "0", "9"])

    def test_does_not_resend_a_value_that_did_not_change(self):
        board = self.board()
        lamp = board.led("按鈕")
        level = board.value("溫度")
        board.start()
        for _ in range(5):
            lamp.set(False)
            level.set(25)
            Clock.now += 600
            board.check()
        self.assertEqual(self.sent("out/0l"), ["0"])
        self.assertEqual(self.sent("out/1v"), ["", "25"])
        lamp.set(True)
        Clock.now += 600
        board.check()
        self.assertEqual(self.sent("out/0l"), ["0", "1"])

    def test_resends_everything_after_reconnecting(self):
        board = self.board()
        level = board.value("溫度")
        board.start()
        Clock.now += 600
        level.set(25)
        board.check()
        self.client().broken = True
        board.check()
        Clock.now += 6000
        board.check()
        self.assertEqual(self.sent("out/0v"), ["25"])

    def test_rounds_floats(self):
        board = self.board()
        temp = board.value("溫度")
        board.start()
        Clock.now += 500
        temp.set(25.123456)
        board.check()
        self.assertEqual(self.sent("out/0v")[-1], "25.12")

    def test_switch_follows_the_phone_and_echoes_back(self):
        board = self.board()
        light = board.switch("LED")
        board.start()
        Clock.now += 500
        self.client().inbox.append(((BASE + "in/0w").encode(), b"1"))
        board.check()
        self.assertIs(light.value, True)
        self.assertEqual(self.sent("out/0w")[-1], "1")

    def test_switch_keeps_its_state_from_before_a_restart(self):
        FakeClient.retained[BASE + "in/0w"] = "1"
        board = self.board()
        light = board.switch("LED")
        board.start()
        self.assertIs(light.value, True)
        self.assertEqual(self.sent("out/0w"), ["1"])

    def test_the_board_can_change_a_switch_and_the_broker_remembers(self):
        board = self.board()
        light = board.switch("LED")
        board.start()
        Clock.now += 500
        light.set(True)
        board.check()
        self.assertEqual(FakeClient.retained[BASE + "in/0w"], "1")
        self.assertEqual(self.sent("out/0w")[-1], "1")

    def test_button_counts_a_press_once(self):
        board = self.board()
        ring = board.button("響鈴")
        board.start()
        self.assertFalse(ring.pressed())
        self.client().inbox.append(((BASE + "in/0b").encode(), b"1"))
        board.check()
        self.assertTrue(ring.pressed())
        self.assertFalse(ring.pressed())
        self.assertEqual(self.sent("out/0b"), [])
        with self.assertRaises(ValueError):
            ring.set(1)

    def test_slider_stays_in_range(self):
        board = self.board()
        level = board.slider("亮度", min=0, max=100)
        board.start()
        self.assertEqual(level.value, 0)
        for text, expected in ((b"55", 55), (b"300", 100), (b"-4", 0), (b"abc", 0), (b"42.7", 42)):
            self.client().inbox.append(((BASE + "in/0r").encode(), text))
            board.check()
            self.assertEqual(level.value, expected)

    def test_ignores_messages_for_other_widgets(self):
        board = self.board()
        light = board.switch("LED")
        board.start()
        self.client().inbox.append(((BASE + "in/5w").encode(), b"1"))
        board.check()
        self.assertIs(light.value, False)

    def test_reconnects_five_seconds_after_losing_the_broker(self):
        board = self.board()
        temp = board.value("溫度")
        board.start()
        first = self.client()
        first.broken = True
        board.check()
        self.assertIsNone(board.client)
        temp.set(30)
        Clock.now += 4000
        board.check()
        self.assertEqual(len(FakeClient.instances), 1)
        Clock.now += 1500
        board.check()
        self.assertEqual(len(FakeClient.instances), 2)
        self.assertEqual(self.sent("out/0v"), ["30"])

    def test_keeps_running_when_the_broker_refuses(self):
        FakeClient.fail_connect = True
        board = self.board()
        board.value("溫度")
        board.start()
        self.assertIsNone(board.client)
        board.check()
        self.assertEqual(len(FakeClient.instances), 1)

    def test_keeps_running_when_wifi_fails(self):
        FakeWlan.connected = False
        board = self.board()
        board.start()
        self.assertIsNone(board.client)
        self.assertEqual(FakeClient.instances, [])

    def test_color_follows_the_phone_and_the_board(self):
        board = self.board()
        shade = board.color("燈色")
        board.start()
        self.assertEqual(shade.value, (255, 255, 255))
        self.assertEqual(self.sent("out/0h"), ["#ffffff"])
        for text in (b"#ff8000", b"red", b"#zz0000"):
            self.client().inbox.append(((BASE + "in/0h").encode(), text))
            board.check()
        self.assertEqual(shade.value, (255, 128, 0))
        Clock.now += 600
        shade.set((300, -5, 16))
        board.check()
        self.assertEqual(shade.value, (255, 0, 16))
        self.assertEqual(FakeClient.retained[BASE + "in/0h"], "#ff0010")

    def test_pad_stops_by_itself_when_the_phone_goes_quiet(self):
        board = self.board()
        drive = board.pad("方向")
        board.start()
        self.assertEqual(drive.value, "")
        self.client().inbox.append(((BASE + "in/0p").encode(), b"up"))
        board.check()
        self.assertEqual(drive.value, "up")
        # The phone repeats the direction while it is held.
        Clock.now += 800
        self.client().inbox.append(((BASE + "in/0p").encode(), b"up"))
        board.check()
        Clock.now += 800
        board.check()
        self.assertEqual(drive.value, "up")
        Clock.now += 300
        board.check()
        self.assertEqual(drive.value, "")
        self.client().inbox.append(((BASE + "in/0p").encode(), b"fly"))
        board.check()
        self.assertEqual(drive.value, "")
        self.assertEqual(self.sent("out/0p"), [])
        with self.assertRaises(ValueError):
            drive.set("up")

    def test_pad_stops_at_once_when_the_connection_drops(self):
        board = self.board()
        drive = board.pad("方向")
        board.start()
        self.client().inbox.append(((BASE + "in/0p").encode(), b"left"))
        board.check()
        self.client().broken = True
        board.check()
        self.assertEqual(drive.value, "")

    def test_select_accepts_only_its_own_options(self):
        board = self.board()
        mode = board.select("模式", ["關", "亮", "閃爍"])
        board.start()
        layout = json.loads(FakeClient.retained[BASE + "layout"])
        self.assertEqual(layout["w"][0]["o"], ["關", "亮", "閃爍"])
        self.assertEqual(mode.value, "關")
        self.client().inbox.append(((BASE + "in/0s").encode(), "閃爍".encode()))
        board.check()
        self.assertEqual(mode.value, "閃爍")
        self.client().inbox.append(((BASE + "in/0s").encode(), "爆炸".encode()))
        board.check()
        self.assertEqual(mode.value, "閃爍")
        with self.assertRaises(ValueError):
            mode.set("爆炸")
        with self.assertRaises(ValueError):
            board.select("空的", [])

    def test_input_reports_new_text_once(self):
        board = self.board()
        message = board.input("訊息")
        board.start()
        self.assertFalse(message.changed())
        self.client().inbox.append(((BASE + "in/0i").encode(), ("嗨" * 150).encode()))
        board.check()
        self.assertTrue(message.changed())
        self.assertFalse(message.changed())
        self.assertEqual(message.value, "嗨" * 100)

    def test_input_keeps_the_last_text_after_a_restart(self):
        FakeClient.retained[BASE + "in/0i"] = "早安"
        board = self.board()
        message = board.input("訊息")
        board.start()
        self.assertEqual(message.value, "早安")
        self.assertTrue(message.changed())

    def test_alerts_are_never_kept_and_repeat_the_same_text(self):
        board = self.board()
        bell = board.alert("門鈴")
        board.start()
        self.assertEqual(self.sent("out/0a"), [])
        for _ in range(2):
            Clock.now += 600
            bell.send("有人按門鈴")
            board.check()
        self.assertEqual(self.sent("out/0a"), ["有人按門鈴", "有人按門鈴"])
        self.assertNotIn(BASE + "out/0a", FakeClient.retained)

    def test_a_default_set_before_start_gives_way_to_the_kept_value(self):
        board = self.board()
        level = board.slider("亮度")
        level.set(20)
        board.start()
        self.assertEqual(level.value, 20)
        self.assertEqual(FakeClient.retained[BASE + "in/0r"], "20")

        FakeClient.instances = []
        FakeClient.retained[BASE + "in/0r"] = "75"
        board = self.board()
        level = board.slider("亮度")
        level.set(20)
        board.start()
        self.assertEqual(level.value, 75)
        self.assertEqual(FakeClient.retained[BASE + "in/0r"], "75")

    def test_limits_the_number_of_widgets(self):
        board = self.board()
        for number in range(30):
            board.led(str(number))
        with self.assertRaises(ValueError):
            board.led("one too many")

    def test_number_stays_in_range_on_its_steps_and_reports_changes(self):
        board = self.board()
        limit = board.number("溫度門檻", value=30, min=20, max=40, step=0.5, unit="°C")
        count = board.number("次數")
        board.start()
        layout = json.loads(FakeClient.retained[BASE + "layout"])
        self.assertEqual(layout["w"][0], {"id": "0n", "t": "number", "l": "溫度門檻", "min": 20, "max": 40, "step": 0.5, "u": "°C"})
        self.assertEqual(limit.value, 30)
        self.assertEqual(count.value, 0)
        self.assertEqual(self.sent("out/0n"), ["30.0"])
        self.assertFalse(limit.changed())
        for text in (b"31.3", b"99", b"abc"):
            self.client().inbox.append(((BASE + "in/0n").encode(), text))
            board.check()
        self.assertEqual(limit.value, 40)
        self.assertTrue(limit.changed())
        self.assertFalse(limit.changed())
        self.client().inbox.append(((BASE + "in/1n").encode(), b"7.6"))
        board.check()
        self.assertEqual(count.value, 8)
        self.assertIsInstance(count.value, int)
        Clock.now += 600
        limit.set(25.2)
        board.check()
        self.assertEqual(limit.value, 25)
        self.assertEqual(FakeClient.retained[BASE + "in/0n"], "25.0")
        with self.assertRaises(ValueError):
            board.number("壞的", min=5, max=5)
        with self.assertRaises(ValueError):
            board.number("壞的", step=0)

    def test_number_keeps_the_phone_setting_after_a_restart(self):
        FakeClient.retained[BASE + "in/0n"] = "33.5"
        board = self.board()
        limit = board.number("溫度門檻", value=30, min=20, max=40, step=0.5)
        board.start()
        self.assertEqual(limit.value, 33.5)

    def test_log_sends_each_row_once_and_never_keeps_it(self):
        board = self.board()
        table = board.log("溫濕度", ["溫度", "濕度"])
        board.start()
        layout = json.loads(FakeClient.retained[BASE + "layout"])
        self.assertEqual(layout["w"][0], {"id": "0o", "t": "log", "l": "溫濕度", "o": ["溫度", "濕度"]})
        self.assertEqual(self.sent("out/0o"), [])
        Clock.now += 600
        table.add(25.123, 60)
        board.check()
        # Rows added faster than a widget may send wait, and then go out together.
        table.add(25.5, 61)
        table.add(None, "錯誤")
        board.check()
        Clock.now += 600
        board.check()
        board.check()
        self.assertEqual([json.loads(text) for text in self.sent("out/0o")], [[[25.12, 60]], [[25.5, 61], [None, "錯誤"]]])
        self.assertNotIn(BASE + "out/0o", FakeClient.retained)
        with self.assertRaises(ValueError):
            table.add(1)
        with self.assertRaises(ValueError):
            table.set([1, 2])
        with self.assertRaises(ValueError):
            board.log("空的", [])

    def test_log_keeps_the_newest_rows_while_offline_and_sends_them_later(self):
        board = self.board()
        table = board.log("計數", ["次數"])
        board.start()
        self.client().broken = True
        board.check()
        for number in range(25):
            table.add(number)
        Clock.now += 5000
        board.check()
        rows = json.loads(self.sent("out/0o")[0])
        self.assertEqual(rows, [[number] for number in range(5, 25)])
        # A reconnect does not send the same rows again.
        self.client().broken = True
        board.check()
        Clock.now += 5000
        board.check()
        self.assertEqual(self.sent("out/0o"), [])

    def test_joystick_and_tilt_follow_the_phone_and_return_to_rest(self):
        board = self.board()
        stick = board.joystick("搖桿")
        tilt = board.tilt("傾斜")
        board.start()
        self.assertEqual((stick.x, stick.y, stick.on), (0, 0, False))
        for text in (b"30,-150", b"oops", b"1,2,3", b"5"):
            self.client().inbox.append(((BASE + "in/0j").encode(), text))
            board.check()
        self.assertEqual((stick.x, stick.y, stick.on), (30, -100, True))
        self.client().inbox.append(((BASE + "in/0j").encode(), b""))
        board.check()
        self.assertEqual((stick.x, stick.y, stick.on), (0, 0, False))

        self.client().inbox.append(((BASE + "in/1m").encode(), b"-40,70"))
        board.check()
        self.assertEqual((tilt.x, tilt.y, tilt.on), (-40, 70, True))
        # The phone sends every 0.2 s while tilt is on; when it goes quiet the board stops by itself.
        Clock.now += 900
        board.check()
        self.assertEqual(tilt.y, 70)
        Clock.now += 200
        board.check()
        self.assertEqual((tilt.x, tilt.y, tilt.on), (0, 0, False))

        self.client().inbox.append(((BASE + "in/1m").encode(), b"10,10"))
        board.check()
        self.client().broken = True
        board.check()
        self.assertEqual((tilt.x, tilt.y, tilt.on), (0, 0, False))
        self.assertEqual(self.sent("out/0j") + self.sent("out/1m"), [])
        with self.assertRaises(ValueError):
            stick.set((1, 1))

    def test_reports_signal_running_time_and_memory_every_ten_seconds(self):
        board = self.board()
        board.value("溫度")
        board.start()
        info = json.loads(FakeClient.retained[BASE + "info"])
        self.assertEqual(sorted(info), ["m", "r", "u"])
        self.assertEqual(info["r"], -55)
        self.assertEqual(info["m"], 123456)
        # The board has run as long as the clock shows, counted from when it started.
        self.assertEqual(info["u"], Clock.now // 1000)
        Clock.now += 9000
        board.check()
        self.assertEqual(len(self.sent("info")), 1)
        Clock.now += 1500
        board.check()
        self.assertEqual(len(self.sent("info")), 2)
        self.assertEqual(json.loads(self.sent("info")[-1])["u"], Clock.now // 1000)


class EnglishDashTests(DashTests):
    language = "en"


if __name__ == "__main__":
    unittest.main()
