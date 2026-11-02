# 範例 11｜DS18B20 溫度計：每 2 秒在監控窗顯示溫度
# 接線：VCC 接 3V3、GND 接 GND、DATA 接 GPIO 4
# 裸元件要在 DATA 和 3V3 之間接 4.7kΩ 電阻，模組通常已內建
# 圖表：上傳後把監控窗切到「圖表」，用手握住感測器，看溫度慢慢上升；「顯示最近」選 5 或 10 分鐘比較清楚
from machine import Pin
import ds18x20
import onewire
import time

DATA_PIN = 4

# 單線通訊，一條線可接多顆感測器
sensor = ds18x20.DS18X20(onewire.OneWire(Pin(DATA_PIN)))

while True:
    devices = sensor.scan()  # 找出線上所有的感測器
    if not devices:
        print("找不到 DS18B20，請檢查接線和上拉電阻")
        time.sleep(2)
        continue
    sensor.convert_temp()  # 請感測器開始測量
    # 感測器需要約 750 毫秒完成測量
    time.sleep_ms(750)
    for device in devices:  # 逐一讀取每顆感測器
        print("溫度: {:.2f} °C".format(sensor.read_temp(device)))
    time.sleep_ms(1250)  # 加上前面的等待，每 2 秒一次
