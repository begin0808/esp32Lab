# 範例 17｜語音控制 LED（MQTT）：手機或電腦開啟語音控制頁，說「開燈」「關燈」「閃爍」
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

# 要換 MQTT 伺服器時，語音控制頁的進階設定也要改成同一臺
# 這裡用未加密的 TCP 連接埠（通常是 1883），語音控制頁則用 WSS 連接埠
BROKER = "broker.emqx.io"
MQTT_PORT = 1883
# 伺服器要求登入時才填。1883 連接埠不加密，請用這臺伺服器專用的密碼，不要和其他帳號共用
MQTT_USER = ""
MQTT_PASSWORD = ""

# 接收指令用的主題
COMMAND_TOPIC = "esp32-mp-class/{}/command".format(TOPIC_NAME).encode()
# 回報目前狀態用的主題
STATE_TOPIC = "esp32-mp-class/{}/state".format(TOPIC_NAME).encode()

led = Pin(LED_PIN, Pin.OUT, value=0)
mode = "off"
need_report = True  # 狀態有變化時，要回報給語音控制頁


def connect_wifi():
    wlan = network.WLAN()  # 建立 Wi-Fi 連線物件
    wlan.active(True)  # 開啟 Wi-Fi 功能
    if wlan.isconnected():
        return
    wlan.connect(SSID, PASSWORD)  # 開始連線，要等一下才會連上
    print("正在連線 Wi-Fi", end="")
    for _ in range(40):  # 最多等 40 次，每次 0.5 秒，共 20 秒
        if wlan.isconnected():
            print()
            return
        print(".", end="")
        time.sleep(0.5)
    raise RuntimeError("Wi-Fi 連線失敗，請檢查名稱、密碼，以及是否為 2.4GHz")


def on_message(topic, message):  # 收到 MQTT 訊息時會執行這裡
    global mode, need_report
    command = message.decode()
    if command in ("on", "off", "blink"):
        mode = command
        if mode != "blink":
            led.value(1 if mode == "on" else 0)
        need_report = True


def connect_mqtt():
    # 用晶片序號當 ID，每塊板子都不同
    client_id = b"esp32-" + binascii.hexlify(machine.unique_id())
    client = MQTTClient(client_id, BROKER, port=MQTT_PORT, user=MQTT_USER, password=MQTT_PASSWORD, keepalive=60)
    client.set_callback(on_message)  # 指定收到訊息時要做什麼
    # 開發板斷線時，由伺服器通知語音控制頁
    client.set_last_will(STATE_TOPIC, b"offline", retain=True)
    client.connect()
    client.subscribe(COMMAND_TOPIC)  # 訂閱主題，才收得到指令
    print("已連上 MQTT 伺服器")
    print("語音控制頁：", VOICE_PAGE)
    print("MQTT 主題名稱：", TOPIC_NAME)
    return client


def serve(client):
    global need_report
    need_report = True
    last_blink = last_ping = time.ticks_ms()
    while True:
        client.check_msg()  # 看看有沒有新訊息，沒有就繼續往下
        if need_report:
            # retain 讓伺服器保留最新狀態
            client.publish(STATE_TOPIC, mode.encode(), retain=True)
            print("LED 模式：", mode)
            need_report = False

        now = time.ticks_ms()  # 用時間差判斷，不用暫停，才能一直收訊息
        if mode == "blink" and time.ticks_diff(now, last_blink) >= 500:
            led.value(not led.value())
            last_blink = now
        if time.ticks_diff(now, last_ping) >= 30000:
            client.ping()  # 定時通知伺服器，開發板還在線上
            last_ping = now
        time.sleep_ms(20)


while True:
    try:
        connect_wifi()
        serve(connect_mqtt())
    except Exception as error:  # 斷線時不要停止，等一下重新連線
        print("連線中斷，5 秒後重試：", error)
        time.sleep(5)
