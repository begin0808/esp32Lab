# DHT11 資料存到 Google 試算表：每分鐘把溫度和濕度新增成一列
# 接線：DHT11 VCC 接 3V3、GND 接 GND、DATA 接 GPIO 4
# Wi-Fi 必須能上網。設定步驟請看「使用說明」的 Google 試算表
# 網址等於試算表的寫入權限，不要投影或分享。這個範例不驗證伺服器憑證，請勿存放重要資料
import dht
import gc
import network
import requests
import time
from machine import Pin

# 請改成你的 Wi-Fi 名稱與密碼（ESP32 僅支援 2.4GHz）
SSID = "YOUR_WIFI_SSID"
PASSWORD = "YOUR_WIFI_PASSWORD"

# 部署 Apps Script 後拿到的網址，結尾是 /exec
SCRIPT_URL = "YOUR_SCRIPT_URL"

DHT_PIN = 4
SEND_SECONDS = 60

sensor = dht.DHT11(Pin(DHT_PIN))


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


def send_reading(temperature, humidity):
    gc.collect()
    url = "{}?temp={}&hum={}".format(SCRIPT_URL, temperature, humidity)
    response = requests.get(url, timeout=30)
    try:
        # 只讀開頭幾個字：權限設錯時，Google 會回傳記憶體放不下的登入頁
        reply = bytes(response.raw.read(16))
        status = response.status_code
    finally:
        response.close()
    if status != 200 or reply != b"ok":
        raise RuntimeError("Google 沒有回傳 ok，請確認部署時存取權選了「所有人」")


if "YOUR_" in SCRIPT_URL:
    raise RuntimeError("請先把 SCRIPT_URL 改成 Apps Script 的網址")

while True:
    try:
        connect_wifi()
        sensor.measure()
        temperature = sensor.temperature()
        humidity = sensor.humidity()
        print("溫度:", temperature, "°C  濕度:", humidity, "%")
        send_reading(temperature, humidity)
        print("已存到 Google 試算表")
    except Exception as error:
        print("這次沒有存成功，下一次再試：", error)
    time.sleep(SEND_SECONDS)
