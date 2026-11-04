import { lang, t } from "./i18n";

const exampleFiles = import.meta.glob<string>("./examples/**/*.py", { query: "?raw", import: "default", eager: true });

export interface Example {
  /** The file name, which the help page's links use to name an example. */
  id: string;
  name: string;
  code: string;
}

export function example(file: string): string {
  return exampleFiles[`./examples/${lang === "en" ? "en/" : ""}${file}.py`];
}

function item(id: string, name: string): Example {
  return { id, name, code: example(id) };
}

export const EXAMPLE_GROUPS: { label: string; examples: Example[] }[] = [
  {
    label: t("基礎輸出與輸入"),
    examples: [
      item("blink", t("LED 閃爍")),
      item("button_led", t("按鈕開關 LED")),
      item("breathing_led", t("呼吸燈（PWM）")),
      item("knob_led", t("可變電阻調亮度")),
      item("buzzer_song", t("無源蜂鳴器播放小星星")),
      item("servo_sweep", t("SG90 伺服馬達來回轉動")),
    ],
  },
  {
    label: t("感測器"),
    examples: [
      item("light_sensor", t("光敏電阻自動夜燈")),
      item("pir_alarm", t("人體紅外線警報（HC-SR501）")),
      item("ultrasonic", t("超音波測距（HC-SR04）")),
      item("dht11_serial", t("DHT11 溫濕度（監控窗）")),
      item("ds18b20", t("DS18B20 溫度計")),
    ],
  },
  {
    label: t("顯示與燈光"),
    examples: [
      item("ws2812_rainbow", t("WS2812 全彩 LED 彩虹")),
      item("oled_ssd1306", t("SSD1306 OLED 顯示器")),
      item("lcd1602_i2c", t("I2C LCD 1602 顯示器")),
      item("max7219_matrix", t("MAX7219 點矩陣")),
    ],
  },
  {
    label: t("Wi-Fi 與語音"),
    examples: [
      item("web_led", t("手機控制 LED（同一個 Wi-Fi）")),
      item("mqtt_led", t("語音控制 LED（MQTT）")),
      item("dht11_alarm", t("DHT11 溫濕度警報")),
      item("telegram_led", t("Telegram 機器人控制 LED")),
      item("sheets_dht11", t("DHT11 資料存到 Google 試算表")),
    ],
  },
  {
    label: t("進階技巧"),
    examples: [
      item("i2c_scan", t("I2C 掃描（找出裝置位址）")),
      item("button_irq", t("按鈕中斷（IRQ）")),
      item("timer_blink", t("計時器讓 LED 自己閃（Timer）")),
      item("deep_sleep", t("深度睡眠定時醒來")),
      item("espnow_led", t("ESP-NOW 多塊板子互傳")),
      item("asyncio_tasks", t("asyncio 同時做三件事")),
    ],
  },
];

export const EXAMPLES = EXAMPLE_GROUPS.flatMap((group) => group.examples);

/** The same number means the same topic on both editions, so teachers can refer to an example by number. */
export function numberedName(chosen: Example): string {
  return `${EXAMPLES.indexOf(chosen) + 1}. ${chosen.name}`;
}

export function findExample(id: string): Example | undefined {
  return EXAMPLES.find((chosen) => chosen.id === id);
}
