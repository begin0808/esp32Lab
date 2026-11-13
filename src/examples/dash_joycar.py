# 範例 38｜手機搖桿遙控車：推得越遠車子越快，往斜前方推可以邊走邊轉，放開就停
# 接線和範例 31 一樣（L298N 或 L9110S 馬達驅動板）：
#   IN1（L9110S 的 A-1A）接 GPIO 18、IN2（A-1B）接 GPIO 19：左邊馬達
#   IN3（B-1A）接 GPIO 21、IN4（B-1B）接 GPIO 22：右邊馬達
#   驅動板的 GND 一定要和 ESP32 的 GND 接在一起
# 電源：馬達用電池接驅動板（例如 4 顆 3 號電池），不要從 ESP32 供電給馬達。L298N 的 ENA、ENB 跳線帽要保留
# 用法：上傳後，用手機掃描監控窗旁邊的 QR code 打開手機儀表板。Wi-Fi 必須能上網
# 安全：手機放開、斷線或超過 1 秒沒有訊息，車子會自動停下來。第一次測試時先把車子架高，讓輪子懸空
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
MIN_POWER = 50  # 一般 TT 馬達低於 50% 轉不動，所以從 50% 起跳；你的馬達轉不動就再調高
DEAD_ZONE = 10  # 搖桿在中間附近（-10～10）就停，手指輕輕抖動車子不會亂動

# MQTT 主題名稱，每塊板子請用不同的名稱。手機儀表板要輸入一樣的名稱
TOPIC_NAME = "{{CHANNEL}}"

# 每顆馬達用兩支腳控制：一支有 PWM、另一支 0 就往一個方向轉，PWM 越大轉越快
left = (PWM(Pin(LEFT_A_PIN), freq=1000, duty_u16=0), PWM(Pin(LEFT_B_PIN), freq=1000, duty_u16=0))
right = (PWM(Pin(RIGHT_A_PIN), freq=1000, duty_u16=0), PWM(Pin(RIGHT_B_PIN), freq=1000, duty_u16=0))


def power(speed):  # 把 -100～100 換成馬達真正用的力道：中間附近是 0，其他是 50～100
    if abs(speed) < DEAD_ZONE:
        return 0
    size = MIN_POWER + abs(speed) * (100 - MIN_POWER) // 100
    return size if speed > 0 else -size


def motor(pins, speed):  # speed 是 -100～100，正的往前、負的往後
    duty = abs(speed) * 65535 // 100
    pins[0].duty_u16(duty if speed > 0 else 0)
    pins[1].duty_u16(duty if speed < 0 else 0)


board = dash.Dashboard(TOPIC_NAME, SSID, PASSWORD)
stick = board.joystick("搖桿")  # 手機 → 板子：stick.x 左右、stick.y 前後，都是 -100～100
state = board.text("左右馬達")  # 板子 → 手機
board.start()

while True:
    board.check()  # 手機放開或斷線時，stick.x 和 stick.y 會回到 0，車子就停
    # 前進的量加上轉彎的量：往右推時左輪比較快、右輪比較慢，車子就往右轉
    left_speed = power(max(-100, min(100, stick.y + stick.x)))
    right_speed = power(max(-100, min(100, stick.y - stick.x)))
    motor(left, left_speed)
    motor(right, right_speed)
    state.set("左 {}%，右 {}%".format(left_speed, right_speed))
    time.sleep_ms(20)
