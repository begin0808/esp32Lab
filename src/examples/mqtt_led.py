# 語音控制 LED（MQTT）：手機或電腦開啟語音控制頁，說「開燈」「關燈」「閃爍」
# 接線：LED 長腳接 GPIO 18，短腳經 220Ω 電阻接 GND
# Wi-Fi 必須能上網。指令會經過公用 MQTT 伺服器，請勿用來控制重要設備
import binascii
import machine
import network
import time
from machine import Pin
from umqtt.simple import MQTTClient

# 請改成你的 Wi-Fi 名稱與密碼（ESP32 僅支援 2.4GHz）
SSID = "YOUR_WIFI_SSID"
PASSWORD = "YOUR_WIFI_PASSWORD"

LED_PIN = 18

# MQTT 主題名稱要和語音控制頁輸入的一樣，每塊板子請用不同的名稱
TOPIC_NAME = "{{CHANNEL}}"
VOICE_PAGE = "{{VOICE_PAGE}}"

# 要換 MQTT 伺服器時，語音控制頁的進階設定也要改成同一台
# 這裡用未加密的 TCP 連接埠（通常是 1883），語音控制頁則用 WSS 連接埠
BROKER = "broker.emqx.io"
MQTT_PORT = 1883
# 伺服器要求登入時才填。1883 連接埠不加密，請用這台伺服器專用的密碼，不要和其他帳號共用
MQTT_USER = ""
MQTT_PASSWORD = ""

COMMAND_TOPIC = "esp32-mp-class/{}/command".format(TOPIC_NAME).encode()
STATE_TOPIC = "esp32-mp-class/{}/state".format(TOPIC_NAME).encode()

led = Pin(LED_PIN, Pin.OUT, value=0)
mode = "off"
need_report = True


def connect_wifi():
    wlan = network.WLAN()
    wlan.active(True)
    if wlan.isconnected():
        return
    wlan.connect(SSID, PASSWORD)
    print("正在連線 Wi-Fi", end="")
    for _ in range(40):
        if wlan.isconnected():
            print()
            return
        print(".", end="")
        time.sleep(0.5)
    raise RuntimeError("Wi-Fi 連線失敗，請檢查名稱、密碼，以及是否為 2.4GHz")


def on_message(topic, message):
    global mode, need_report
    command = message.decode()
    if command in ("on", "off", "blink"):
        mode = command
        if mode != "blink":
            led.value(1 if mode == "on" else 0)
        need_report = True


def connect_mqtt():
    client_id = b"esp32-" + binascii.hexlify(machine.unique_id())
    client = MQTTClient(client_id, BROKER, port=MQTT_PORT, user=MQTT_USER, password=MQTT_PASSWORD, keepalive=60)
    client.set_callback(on_message)
    # 開發板斷線時，由伺服器通知語音控制頁
    client.set_last_will(STATE_TOPIC, b"offline", retain=True)
    client.connect()
    client.subscribe(COMMAND_TOPIC)
    print("已連上 MQTT 伺服器")
    print("語音控制頁：", VOICE_PAGE)
    print("MQTT 主題名稱：", TOPIC_NAME)
    return client


def serve(client):
    global need_report
    need_report = True
    last_blink = last_ping = time.ticks_ms()
    while True:
        client.check_msg()
        if need_report:
            client.publish(STATE_TOPIC, mode.encode(), retain=True)
            print("LED 模式：", mode)
            need_report = False

        now = time.ticks_ms()
        if mode == "blink" and time.ticks_diff(now, last_blink) >= 500:
            led.value(not led.value())
            last_blink = now
        if time.ticks_diff(now, last_ping) >= 30000:
            client.ping()
            last_ping = now
        time.sleep_ms(20)


while True:
    try:
        connect_wifi()
        serve(connect_mqtt())
    except Exception as error:
        print("連線中斷，5 秒後重試：", error)
        time.sleep(5)
