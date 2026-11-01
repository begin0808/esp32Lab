import { describe, expect, it } from "vitest";
import { isFlashTooSmall, verifySha256 } from "../../src/flasher";
import {
  arduinoConvertPrompt,
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
  parseVoiceCommand,
  randomChannel,
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
