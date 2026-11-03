# 範例 21｜I2C 掃描：找出接在 I2C 上的裝置，顯示位址和可能的型號
# 接線：I2C 模組的 VCC 接 3V3、GND 接 GND、SDA 接 GPIO 21、SCL 接 GPIO 22
# 用途：OLED、LCD 等 I2C 元件沒有反應時，先用它確認接線和位址；每 3 秒掃描一次，結果改變時才顯示
from machine import I2C, Pin
import time

SDA_PIN = 21
SCL_PIN = 22

# 常見模組的位址，同一個位址可能是不同的元件
KNOWN = {
    0x23: "BH1750 光度感測器",
    0x27: "LCD 1602（PCF8574 轉接板）",
    0x38: "AHT10 / AHT20 溫濕度感測器",
    0x3C: "SSD1306 OLED 顯示器",
    0x3D: "SSD1306 OLED 顯示器",
    0x3F: "LCD 1602（PCF8574A 轉接板）",
    0x40: "INA219 電流感測器或 PCA9685 伺服馬達驅動板",
    0x44: "SHT30 溫濕度感測器",
    0x48: "ADS1115 類比轉數位",
    0x57: "AT24C32 EEPROM（常在 DS3231 時鐘模組上）",
    0x68: "MPU6050 加速度計或 DS3231 時鐘",
    0x76: "BME280 / BMP280 氣壓感測器",
    0x77: "BME280 / BMP280 氣壓感測器",
}

i2c = I2C(0, sda=Pin(SDA_PIN), scl=Pin(SCL_PIN), freq=100000)  # 掃描用較慢的速度，比較不挑線
last = None  # 上一次的結果，一開始還沒有

while True:
    found = i2c.scan()  # 回傳每個有回應的裝置位址
    if found != last:
        if found:
            print("找到", len(found), "個 I2C 裝置：")
            for address in found:
                print("  位址", hex(address), "→", KNOWN.get(address, "不在常見清單裡，請查元件規格書"))
        else:
            print("找不到 I2C 裝置。請檢查：SDA 和 SCL 有沒有接反、VCC 和 GND 有沒有接好、模組是不是 I2C 介面")
        last = found
    time.sleep(3)
