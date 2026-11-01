# 範例 8｜人體紅外線警報：HC-SR501 偵測到有人時，有源蜂鳴器響、LED 亮
# 接線：HC-SR501 VCC 接 5V（VIN）、GND 接 GND、OUT 接 GPIO 27
#       有源蜂鳴器模組訊號腳接 GPIO 25；LED 經 220Ω 電阻接 GPIO 18，短腳接 GND
# 感測器通電後約 1 分鐘內可能誤判，這段時間的結果不要採信
from machine import Pin
import time

PIR_PIN = 27
BUZZER_PIN = 25
LED_PIN = 18

pir = Pin(PIR_PIN, Pin.IN)  # 感測器輸出，有人時是 1
buzzer = Pin(BUZZER_PIN, Pin.OUT, value=0)
led = Pin(LED_PIN, Pin.OUT, value=0)

last = 0  # 記住上一次的狀態

while True:
    now = pir.value()  # 讀取感測器
    if now != last:  # 狀態有變化才印，監控窗才不會被洗版
        print("偵測到有人" if now else "沒有人")
        last = now
    buzzer.value(now)  # 有人就響，沒人就停
    led.value(now)
    time.sleep_ms(100)
