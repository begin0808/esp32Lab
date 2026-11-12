import { describe, expect, it } from "vitest";
import { isFlashTooSmall, verifySha256 } from "../../src/flasher";
import {
  arduinoConvertPrompt,
  describeLines,
  explainPrompt,
  brokerUrl,
  commandTopic,
  DEFAULT_BROKER,
  fillExample,
  findDeviceIp,
  findLastTraceback,
  fixErrorPrompt,
  hideWifiSettings,
  isValidBroker,
  isValidChannel,
  looksLikeArduino,
  numberLines,
  parseVoiceCommand,
  randomChannel,
  selectedLineRange,
  stripTerminalCodes,
} from "../../src/text";

describe("hideWifiSettings", () => {
  it("hides an MQTT account and an Apps Script address", () => {
    const code = 'MQTT_USER = "teacher"\nMQTT_PASSWORD = "m0sq"\nSCRIPT_URL = "https://script.google.com/macros/s/ABC123/exec"\nurl = "https://example.com/data"\n';
    const hidden = hideWifiSettings(code);
    expect(hidden).not.toContain("teacher");
    expect(hidden).not.toContain("m0sq");
    expect(hidden).not.toContain("ABC123");
    expect(hidden).toContain('SCRIPT_URL = "YOUR_SCRIPT_URL"');
    expect(hidden).toContain('url = "https://example.com/data"');
  });

  it("hides a Telegram bot token", () => {
    const hidden = hideWifiSettings('BOT_TOKEN = "123456:ABC-secret"\nCHAT_ID = "777"\n');
    expect(hidden).not.toContain("ABC-secret");
    expect(hidden).toContain('CHAT_ID = "777"');
  });

  it("hides MicroPython settings but keeps the rest of the code", () => {
    const code = 'SSID = "home"\nPASSWORD = "s3cret"\nLED_PIN = 12\nprint("hi")\n';
    const hidden = hideWifiSettings(code);
    expect(hidden).not.toContain("home");
    expect(hidden).not.toContain("s3cret");
    expect(hidden).toContain("LED_PIN = 12");
    expect(hidden).toContain('print("hi")');
  });

  it("hides Arduino settings and values passed directly", () => {
    const code = 'const char* ssid = "home";\nconst char* password = "s3cret";\nchar wifi_pass[] = "abc";\nWiFi.begin("home2", "pw2");\nwlan.connect("home3", \'pw3\')\n';
    const hidden = hideWifiSettings(code);
    for (const secret of ["home", "s3cret", "abc", "pw2", "pw3"]) expect(hidden).not.toContain(secret);
    expect(hidden).toContain("WiFi.begin(");
  });

  it("is used by the prompts sent to Gemini", () => {
    const code = 'PASSWORD = "s3cret"\n';
    expect(fixErrorPrompt(code, "NameError")).not.toContain("s3cret");
    expect(arduinoConvertPrompt(code)).not.toContain("s3cret");
  });

  it("leaves unrelated code alone", () => {
    const code = 'client.connect()\nmode = "off"\nsock.connect(addr)\n';
    expect(hideWifiSettings(code)).toBe(code);
  });
});

describe("parseVoiceCommand", () => {
  it("understands spoken commands", () => {
    expect(parseVoiceCommand("開燈")).toBe("on");
    expect(parseVoiceCommand("把燈打開")).toBe("on");
    expect(parseVoiceCommand("關燈")).toBe("off");
    expect(parseVoiceCommand("閃爍")).toBe("blink");
  });

  it("understands English commands", () => {
    expect(parseVoiceCommand("on")).toBe("on");
    expect(parseVoiceCommand("Turn the light on.")).toBe("on");
    expect(parseVoiceCommand("turn off the light")).toBe("off");
    expect(parseVoiceCommand("Blink")).toBe("blink");
    expect(parseVoiceCommand("flashing")).toBe("blink");
  });

  it("does not hear a command inside another word", () => {
    expect(parseVoiceCommand("button")).toBeNull();
    expect(parseVoiceCommand("coffee")).toBeNull();
  });

  it("returns null for anything else", () => {
    expect(parseVoiceCommand("你好")).toBeNull();
    expect(parseVoiceCommand("hello")).toBeNull();
  });
});

describe("broker settings", () => {
  it("builds an encrypted WebSocket address", () => {
    expect(brokerUrl(DEFAULT_BROKER)).toBe("wss://broker.emqx.io:8084/mqtt");
    expect(brokerUrl({ host: "my.broker.test", port: 9001, path: "/" })).toBe("wss://my.broker.test:9001/");
  });

  it("rejects unusable settings", () => {
    expect(isValidBroker(DEFAULT_BROKER)).toBe(true);
    expect(isValidBroker({ ...DEFAULT_BROKER, host: "" })).toBe(false);
    expect(isValidBroker({ ...DEFAULT_BROKER, host: "wss://x" })).toBe(false);
    expect(isValidBroker({ ...DEFAULT_BROKER, port: 0 })).toBe(false);
    expect(isValidBroker({ ...DEFAULT_BROKER, port: 70000 })).toBe(false);
    expect(isValidBroker({ ...DEFAULT_BROKER, port: Number.NaN })).toBe(false);
    expect(isValidBroker({ ...DEFAULT_BROKER, path: "mqtt" })).toBe(false);
  });
});

describe("MQTT channel helpers", () => {
  it("rejects names that would break a topic", () => {
    expect(isValidChannel("led-a1b2")).toBe(true);
    expect(isValidChannel("")).toBe(false);
    expect(isValidChannel("a/b")).toBe(false);
    expect(isValidChannel("#")).toBe(false);
    expect(isValidChannel("通道")).toBe(false);
    expect(isValidChannel("x".repeat(33))).toBe(false);
  });

  it("generates valid, different channels", () => {
    expect(isValidChannel(randomChannel())).toBe(true);
    expect(randomChannel()).not.toBe(randomChannel());
    expect(randomChannel()).toMatch(/^led-[0-9a-f]{12}$/);
    expect(randomChannel("dash")).toMatch(/^dash-[0-9a-f]{12}$/);
    expect(commandTopic("abc")).toBe("esp32-mp-class/abc/command");
  });

  it("fills every placeholder in an example", () => {
    expect(fillExample('A = "{{CHANNEL}}"\nB = "{{VOICE_PAGE}}"\n', "abc", "https://x/voice.html")).toBe('A = "abc"\nB = "https://x/voice.html"\n');
  });
});

describe("looksLikeArduino", () => {
  it("detects code from the course material", () => {
    expect(looksLikeArduino("#include <WiFi.h>\nvoid setup() {}")).toBe(true);
    expect(looksLikeArduino("void loop() {\n}")).toBe(true);
  });

  it("does not flag MicroPython", () => {
    expect(looksLikeArduino("from machine import Pin\nled = Pin(2, Pin.OUT)\n# setup\n")).toBe(false);
  });
});

describe("findDeviceIp", () => {
  it("finds the address in Chinese output", () => {
    expect(findDeviceIp("網頁伺服器已啟動，IP 位址： 192.168.1.105\r\n")).toBe("192.168.1.105");
  });

  it("skips netmasks and unusable addresses", () => {
    expect(findDeviceIp("('255.255.255.0', '0.0.0.0', '127.0.0.1', '10.0.0.8')")).toBe("10.0.0.8");
  });

  it("ignores version-like numbers", () => {
    expect(findDeviceIp("MicroPython v1.29.0 on 2026-08-24")).toBeNull();
    expect(findDeviceIp("999.1.1.1")).toBeNull();
  });
});

describe("findLastTraceback", () => {
  it("returns the complete traceback", () => {
    const output = 'hello\r\nTraceback (most recent call last):\r\n  File "main.py", line 3, in <module>\r\nNameError: name x is not defined\r\n>>> ';
    expect(findLastTraceback(output)).toBe('Traceback (most recent call last):\n  File "main.py", line 3, in <module>\nNameError: name x is not defined');
  });

  it("ignores the stop button's KeyboardInterrupt", () => {
    expect(findLastTraceback('Traceback (most recent call last):\r\n  File "main.py", line 3\r\nKeyboardInterrupt: \r\n')).toBeNull();
  });

  it("waits until the traceback is complete", () => {
    expect(findLastTraceback('Traceback (most recent call last):\r\n  File "main.py", line 3')).toBeNull();
  });

  it("waits for the error line to finish arriving", () => {
    expect(findLastTraceback('Traceback (most recent call last):\r\n  File "main.py", line 13, in <module>\r\nKeyboardInt')).toBeNull();
  });
});

describe("stripTerminalCodes", () => {
  it("removes colour codes from the boot log", () => {
    expect(stripTerminalCodes("\x1b[0;32mI (29) boot\x1b[0m")).toBe("I (29) boot");
  });
});

describe("isFlashTooSmall", () => {
  it("rejects boards under 4MB and accepts unknown sizes", () => {
    expect(isFlashTooSmall("2MB")).toBe(true);
    expect(isFlashTooSmall("4MB")).toBe(false);
    expect(isFlashTooSmall("16MB")).toBe(false);
    expect(isFlashTooSmall(undefined)).toBe(false);
  });
});

describe("verifySha256", () => {
  it("compares against the expected digest", async () => {
    const data = new TextEncoder().encode("abc");
    const digest = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    expect(await verifySha256(data, digest)).toBe(true);
    expect(await verifySha256(data, "00")).toBe(false);
  });
});

describe("explain prompt", () => {
  const code = "from machine import Pin\n\nled = Pin(2, Pin.OUT)\nled.on()\n";
  const board = "- 開發板：NodeMCU ESP-32S（ESP32，MicroPython v1.29.0）\n- 板載 LED：GPIO 2";

  it("finds the lines a selection covers", () => {
    const third = code.indexOf("led =");
    expect(selectedLineRange(code, third, third)).toBeNull();
    expect(selectedLineRange(code, third, third + 3)).toEqual({ from: 3, to: 3 });
    expect(selectedLineRange(code, code.length, third)).toEqual({ from: 3, to: 4 });
    // Dragging over whole lines ends at the start of the next one.
    expect(selectedLineRange(code, 0, third)).toEqual({ from: 1, to: 2 });
  });

  it("treats a selection of every line as the whole program", () => {
    expect(selectedLineRange(code, 0, code.length)).toBeNull();
    expect(selectedLineRange(code, 0, code.length - 1)).toBeNull();
    expect(selectedLineRange(code, 3, code.length)).toBeNull();
    expect(selectedLineRange(code, code.indexOf("\n") + 1, code.length)).toEqual({ from: 2, to: 4 });
  });

  it("names one line or a run of lines", () => {
    expect(describeLines({ from: 5, to: 5 })).toBe("第 5 行");
    expect(describeLines({ from: 5, to: 12 })).toBe("第 5–12 行");
  });

  it("numbers the lines as the editor does", () => {
    const lines = numberLines("a = 1\n\n" + "b = 2\n".repeat(8)).split("\n");
    expect(lines).toHaveLength(10);
    expect(lines[0]).toBe(" 1 | a = 1");
    expect(lines[1]).toBe(" 2 |");
    expect(lines[9]).toBe("10 | b = 2");
  });

  it("asks for an explanation of the whole program, with the board and numbered code", () => {
    const prompt = explainPrompt(code, board);
    expect(prompt).toContain("MicroPython 初學者");
    expect(prompt).toContain("板載 LED：GPIO 2");
    expect(prompt).toContain("一句話說明這個程式在做什麼");
    expect(prompt).toContain("請不要改寫或重寫程式");
    expect(prompt).toContain("3 | led = Pin(2, Pin.OUT)");
    expect(prompt).not.toContain("其他行只是讓你了解前後文");
    expect(prompt).not.toContain("YOUR_WIFI_SETTING");
  });

  it("asks about the selected lines but still sends the whole program", () => {
    const prompt = explainPrompt(code, board, { from: 3, to: 4 });
    expect(prompt).toContain("程式（MicroPython v1.29.0）的第 3–4 行。其他行只是讓你了解前後文，不用解說。");
    expect(prompt).toContain("這幾行在整個程式裡負責什麼");
    expect(prompt).toContain("1 | from machine import Pin");
    expect(prompt).toContain("4 | led.on()");
  });

  it("hides Wi-Fi details and says what the placeholders stand for", () => {
    const prompt = explainPrompt('SSID = "home"\nPASSWORD = "secret"\nprint(1)\n', board);
    expect(prompt).not.toContain("secret");
    expect(prompt).toContain('2 | PASSWORD = "YOUR_WIFI_SETTING"');
    expect(prompt).toContain("先隱藏起來的");
  });
});
