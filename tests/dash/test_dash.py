"""Tests dash.py on CPython, with fake MicroPython modules: a clock that only moves when told, Wi-Fi and MQTT."""
import json
import os
import sys
import types
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
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


def load_dash(language):
    import importlib.util

    path = os.path.join(ROOT, "src", "lib", *(["en"] if language == "en" else []), "dash.py")
    spec = importlib.util.spec_from_file_location("dash_" + language, path)
    module = importlib.util.module_from_spec(spec)
    real_time = sys.modules.get("time")
    install_fakes()
    try:
        spec.loader.exec_module(module)
    finally:
        if real_time is not None:
            sys.modules["time"] = real_time
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
        board.gauge("溫度", min=0, max=50, unit="°C")
        board.switch("LED")
        board.start()
        layout = json.loads(FakeClient.retained[BASE + "layout"])
        self.assertEqual(layout["v"], 1)
        self.assertEqual(
            layout["w"],
            [{"id": "0g", "t": "gauge", "l": "溫度", "min": 0, "max": 50, "u": "°C"}, {"id": "1w", "t": "switch", "l": "LED"}],
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

    def test_limits_the_number_of_widgets(self):
        board = self.board()
        for number in range(30):
            board.led(str(number))
        with self.assertRaises(ValueError):
            board.led("one too many")


class EnglishDashTests(DashTests):
    language = "en"


if __name__ == "__main__":
    unittest.main()
