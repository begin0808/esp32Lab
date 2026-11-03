# 範例 24｜深度睡眠：醒來閃一下 LED、記下第幾次醒來，再睡 10 秒，很省電
# 接線：使用 ESP32-S 開發板的板載藍色 LED（GPIO 2），不用另外接線
# 請用「上傳並執行」：「執行（不存檔）」的程式睡著就不見了，醒來會改跑板子原本的 main.py
# 板子睡著時不理會網站，醒來後有 5 秒可以按「停止」，才能修改或上傳新程式
# USB 直接接晶片的板子（S2、S3、C3）睡著時 USB 會斷線，醒來後要重新連接開發板
import machine
import time
from machine import Pin

LED_PIN = 2
AWAKE_SECONDS = 5  # 醒著等幾秒
SLEEP_SECONDS = 10  # 睡幾秒

led = Pin(LED_PIN, Pin.OUT, value=0)
rtc = machine.RTC()

# 深度睡眠時一般變數都會消失，RTC 記憶體會保留，用來記住醒來幾次
if machine.reset_cause() == machine.DEEPSLEEP_RESET and rtc.memory():
    count = int(rtc.memory().decode()) + 1
    print("從深度睡眠醒來，這是第", count, "次醒來")
else:
    count = 0
    print("剛開機或剛重新啟動，從 0 開始數")
rtc.memory(str(count).encode())  # 存回 RTC 記憶體，下次醒來才讀得到

led.on()  # 閃一下，表示醒著
time.sleep(0.2)
led.off()

for left in range(AWAKE_SECONDS, 0, -1):
    print(left, "秒後睡覺；現在按「停止」可以中斷")
    time.sleep(1)

print("睡", SLEEP_SECONDS, "秒，醒來會重新執行 main.py")
time.sleep_ms(50)  # 讓最後一行字送完再睡
machine.deepsleep(SLEEP_SECONDS * 1000)  # 單位是毫秒；醒來時就像重新開機
