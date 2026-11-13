# 範例 31｜手機方向鍵遙控車：按住手機的方向鍵，車子就前進、後退或轉彎，放開就停
# 接線（L298N 或 L9110S 馬達驅動板）：
#   IN1（L9110S 的 A-1A）接 GPIO 18、IN2（A-1B）接 GPIO 19：左邊馬達
#   IN3（B-1A）接 GPIO 21、IN4（B-1B）接 GPIO 22：右邊馬達
#   驅動板的 GND 一定要和 ESP32 的 GND 接在一起
# 電源：馬達用電池接驅動板（例如 4 顆 3 號電池），不要從 ESP32 供電給馬達。L298N 的 ENA、ENB 跳線帽要保留
# 用法：上傳後，用手機掃描監控窗旁邊的 QR code 打開手機儀表板。Wi-Fi 必須能上網
# 安全：手機斷線或超過 1 秒沒有訊息，車子會自動停下來。第一次測試時先把車子架高，讓輪子懸空
import time
import dash
from machine import Pin, PWM

# 請改成你的 Wi-Fi 名稱與密碼（ESP32 僅支援 2.4GHz）
SSID = "YOUR_WIFI_SSID"
PASSWORD = "YOUR_WIFI_PASSWORD"

LEFT_A_PIN = 18
LEFT_B_PIN = 19
RIGHT_A_PIN = 21
RIGHT_B_PIN = 22

# MQTT 主題名稱，每塊板子請用不同的名稱。手機儀表板要輸入一樣的名稱
TOPIC_NAME = "{{CHANNEL}}"

# 每顆馬達用兩支腳控制：一支有 PWM、另一支 0 就往一個方向轉，PWM 越大轉越快
left = (PWM(Pin(LEFT_A_PIN), freq=1000, duty_u16=0), PWM(Pin(LEFT_B_PIN), freq=1000, duty_u16=0))
right = (PWM(Pin(RIGHT_A_PIN), freq=1000, duty_u16=0), PWM(Pin(RIGHT_B_PIN), freq=1000, duty_u16=0))

# 每個方向對應左右馬達要怎麼轉：1 往前、-1 往後、0 停止
MOVES = {"up": (1, 1), "down": (-1, -1), "left": (-1, 1), "right": (1, -1), "": (0, 0)}
NAMES = {"up": "前進", "down": "後退", "left": "左轉", "right": "右轉", "": "停止"}


def motor(pins, speed):  # speed 是 -100～100，正的往前、負的往後
    duty = abs(speed) * 65535 // 100
    pins[0].duty_u16(duty if speed > 0 else 0)
    pins[1].duty_u16(duty if speed < 0 else 0)


board = dash.Dashboard(TOPIC_NAME, SSID, PASSWORD)
drive = board.pad("方向")  # 手機 → 板子：按住才會動
speed = board.slider("速度", min=50, max=100, unit="%")  # 一般 TT 馬達低於 50% 轉不動，所以從 50% 起跳；你的馬達轉不動就再調高
state = board.text("車子狀態")  # 板子 → 手機
speed.set(60)  # 第一次用 60% 的速度，之後伺服器會記住手機上最後的位置
board.start()

while True:
    board.check()  # 手機放開或斷線時，drive.value 會變成 ""，車子就停
    left_way, right_way = MOVES[drive.value]
    motor(left, left_way * speed.value)
    motor(right, right_way * speed.value)
    state.set("{}（{}%）".format(NAMES[drive.value], speed.value))
    time.sleep_ms(20)
