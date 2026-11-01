# 範例 19｜Telegram 機器人控制 LED：傳 /on、/off、/status 控制 LED，按下按鈕時通知手機
# 接線：LED 經 220Ω 電阻接 GPIO 18，短腳接 GND；按鈕一腳接 GPIO 19、另一腳接 GND
# Wi-Fi 必須能上網。設定步驟請看「使用說明」的 Telegram 機器人
# Bot Token 等於機器人的密碼，不要投影或分享。這個範例不驗證伺服器憑證，請勿用來控制重要設備
import gc
import json
import network
import requests
import time
from machine import Pin

# 請改成你的 Wi-Fi 名稱與密碼（ESP32 僅支援 2.4GHz）
SSID = "YOUR_WIFI_SSID"
PASSWORD = "YOUR_WIFI_PASSWORD"

# 向 Telegram 的 @BotFather 建立機器人後，會拿到 Bot Token
BOT_TOKEN = "YOUR_BOT_TOKEN"
# 先留空並上傳，傳訊息給機器人後，監控窗會顯示你的號碼，填進來再上傳一次
# 只有這個聊天室能控制開發板
CHAT_ID = ""

LED_PIN = 18
BUTTON_PIN = 19
POLL_SECONDS = 2

# Telegram 機器人 API 的網址
API_URL = "https://api.telegram.org/bot{}/".format(BOT_TOKEN)

led = Pin(LED_PIN, Pin.OUT, value=0)
button = Pin(BUTTON_PIN, Pin.IN, Pin.PULL_UP)
button_pressed = False
last_press = 0
next_update = None


def on_button(_pin):  # 按下按鈕時自動執行，不用一直檢查
    global button_pressed, last_press
    now = time.ticks_ms()
    # 忽略 200 毫秒內的重複觸發，避開按鈕彈跳
    if time.ticks_diff(now, last_press) > 200:
        button_pressed = True  # 只做記號，網路工作留到主程式處理
        last_press = now


# 按下時電位由高變低，就執行 on_button
button.irq(trigger=Pin.IRQ_FALLING, handler=on_button)


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


def call_telegram(method, payload):  # 呼叫 Telegram 的共用函式
    gc.collect()  # HTTPS 很吃記憶體，先清出空間
    # 中文要先轉成位元組，傳送的資料長度才會正確
    body = json.dumps(payload).encode()
    response = requests.post(API_URL + method, data=body, headers={"Content-Type": "application/json"}, timeout=15)
    try:
        result = response.json()  # 把回應轉成字典
    finally:
        response.close()  # 用完要關閉，否則記憶體會不夠
    if not result["ok"]:
        raise RuntimeError("Telegram 回報錯誤：{}".format(result.get("description")))
    return result["result"]


def send_message(text):
    call_telegram("sendMessage", {"chat_id": CHAT_ID, "text": text})


def led_status():
    return "LED 目前是{}".format("亮的" if led.value() else "暗的")


def handle_message(message):
    chat_id = str(message["chat"]["id"])  # 訊息來自哪個聊天室
    if not CHAT_ID:
        print("你的 CHAT_ID 是", chat_id, "，請填進程式後重新上傳")
        return
    if chat_id != CHAT_ID:  # 別人的訊息不處理，避免被別人控制
        print("已忽略其他聊天室的訊息")
        return

    words = message.get("text", "").split()
    # 群組裡的指令會長得像 /on@機器人名稱
    command = words[0].split("@")[0].lower() if words else ""
    if command == "/on":
        led.value(1)
        send_message("已開燈")
    elif command == "/off":
        led.value(0)
        send_message("已關燈")
    elif command == "/status":
        send_message(led_status())
    else:
        send_message("可以使用的指令：/on 開燈、/off 關燈、/status 查詢狀態")
    print("收到指令：", command)


def skip_old_messages():
    """開發板離線時累積的舊指令不要執行，只從現在開始處理。"""
    updates = call_telegram("getUpdates", {"offset": -1, "timeout": 0})
    return updates[-1]["update_id"] + 1 if updates else 0


def serve():
    global button_pressed, next_update
    # 只在開機時略過一次，網路短暫中斷時收到的指令還是會處理
    if next_update is None:
        next_update = skip_old_messages()
    print("機器人已上線，請到 Telegram 傳 /status 給它")
    while True:
        if button_pressed:
            button_pressed = False
            if CHAT_ID:
                send_message("按鈕被按下了")
                print("已通知 Telegram")
            else:
                print("還沒有設定 CHAT_ID，無法傳送通知")

        # 問 Telegram 有沒有新訊息
        updates = call_telegram("getUpdates", {"offset": next_update, "limit": 5, "timeout": 0, "allowed_updates": ["message"]})
        for update in updates:
            # 先記下進度，處理失敗時才不會一直重複同一則指令
            next_update = update["update_id"] + 1
            if "message" in update:
                handle_message(update["message"])
        time.sleep(POLL_SECONDS)  # 隔一段時間再問一次


if "YOUR_" in BOT_TOKEN:
    raise RuntimeError("請先把 BOT_TOKEN 改成 @BotFather 給你的 Bot Token")

while True:
    try:
        connect_wifi()
        serve()
    except Exception as error:
        print("連線中斷，5 秒後重試：", error)
        time.sleep(5)
