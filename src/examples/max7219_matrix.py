# 範例 15｜MAX7219 8×8 LED 點矩陣：輪流顯示笑臉和愛心
# 接線：VCC 接 5V（VIN）、GND 接 GND、DIN 接 GPIO 23、CLK 接 GPIO 18、CS 接 GPIO 5
# 韌體沒有內建這個元件的控制程式，下面的 MAX7219 類別已經寫在這個檔案裡，不用另外安裝
# 模組以 5V 供電時，3.3V 訊號可能不穩定。顯示異常時再加準位轉換模組
from machine import Pin
import time

DIN_PIN = 23
CLK_PIN = 18
CS_PIN = 5
BRIGHTNESS = 2  # 0 到 15

# 每個圖案有 8 列，每列 8 個位元，1 代表亮
SMILE = (
    0b00111100,
    0b01000010,
    0b10100101,
    0b10000001,
    0b10100101,
    0b10011001,
    0b01000010,
    0b00111100,
)
HEART = (
    0b00000000,
    0b01100110,
    0b11111111,
    0b11111111,
    0b01111110,
    0b00111100,
    0b00011000,
    0b00000000,
)


class MAX7219:
    def __init__(self, din, clk, cs, brightness):
        self.din = din
        self.clk = clk
        self.cs = cs
        self.write(0x0F, 0)  # 關閉測試模式
        self.write(0x09, 0)  # 不使用七段解碼
        self.write(0x0B, 7)  # 掃描全部 8 列
        self.write(0x0A, brightness)
        self.write(0x0C, 1)  # 結束關機模式

    def write(self, register, value):
        self.cs.value(0)  # CS 拉低，開始傳送
        # 從最高位元開始，一次送出 16 個位元
        data = register << 8 | value  # 前 8 位元是暫存器，後 8 位元是資料
        for bit in range(15, -1, -1):
            self.din.value((data >> bit) & 1)
            self.clk.value(1)  # 時脈由低變高時，晶片讀入 1 個位元
            self.clk.value(0)
        self.cs.value(1)  # CS 拉高，晶片才會套用資料

    def show(self, rows):
        # 一列一列寫入，暫存器 1 到 8 對應第 1 到 8 列
        for index, row in enumerate(rows):
            self.write(index + 1, row)


din = Pin(DIN_PIN, Pin.OUT, value=0)
clk = Pin(CLK_PIN, Pin.OUT, value=0)
cs = Pin(CS_PIN, Pin.OUT, value=1)
matrix = MAX7219(din, clk, cs, BRIGHTNESS)

while True:
    matrix.show(SMILE)  # 顯示笑臉
    time.sleep(1)
    matrix.show(HEART)
    time.sleep(1)
