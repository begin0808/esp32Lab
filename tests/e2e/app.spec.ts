import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const fakeBoardScript = readFileSync("tests/fake-board.js", "utf8");

async function mockSerial(page: Page, options: object = {}) {
  await page.addInitScript(fakeBoardScript);
  await page.addInitScript((boardOptions) => {
    const g = globalThis as any;
    g.board = new g.FakeBoard(boardOptions);
    const port = new g.FakePort(g.board);
    Object.defineProperty(navigator, "serial", {
      value: { requestPort: async () => port },
    });
  }, options);
}

test("uploads code and shows the device IP", async ({ page }) => {
  await mockSerial(page);
  await page.goto("/");

  await expect(page.locator("#upload")).toBeDisabled();
  await page.locator("#connect").click();
  await expect(page.locator("#status")).toContainText("Generic ESP32 module");
  await expect(page.locator("#status")).toContainText("4 MB");
  await expect(page.locator("#upload")).toBeEnabled();
  await expect(page.locator("#monitor")).not.toContainText("raw REPL");

  await page.locator("#editor .cm-content").fill('print("IP 測試")\n');
  await page.locator("#upload").click();

  await expect(page.locator("#ip-link")).toHaveText("http://192.168.1.105");
  const stored = await page.evaluate(() => (globalThis as any).board.files["/main.py"]);
  expect(stored).toBe('print("IP 測試")\n');
  expect(await page.evaluate(() => (globalThis as any).board.resets)).toBe(1);
  await expect(page.locator("#status")).toContainText("程式執行中");
});

test("asks to install firmware when MicroPython is missing", async ({ page }) => {
  await mockSerial(page, { hasMicroPython: false });
  await page.goto("/");

  await page.locator("#connect").click();
  await expect(page.locator("#status")).toContainText("請先安裝韌體", { timeout: 20_000 });
  await expect(page.locator("#upload")).toBeDisabled();
  await expect(page.locator("#install")).toBeEnabled();

  await page.locator("#install").click();
  await expect(page.locator("#install-dialog")).toContainText("都會被清除");
  await page.locator('#install-dialog button[value="cancel"]').click();
  await expect(page.locator("#install-dialog")).not.toBeVisible();
});

test("offers help for a Python error", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await mockSerial(page, {
    runOutput: 'Traceback (most recent call last):\r\n  File "main.py", line 1, in <module>\r\nNameError: name x is not defined\r\n>>> ',
  });
  await page.goto("/");
  await page.locator("#connect").click();
  await expect(page.locator("#upload")).toBeEnabled();
  await page.locator("#editor .cm-content").fill("print(x)\n");
  await page.locator("#upload").click();

  await expect(page.locator("#error-card")).toBeVisible();
  await page.locator("#copy-error").click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("NameError");
  expect(copied).toContain("print(x)");
});

test("warns about Arduino code", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await mockSerial(page);
  await page.goto("/");
  await expect(page.locator("#arduino-warning")).toBeHidden();
  await page.locator("#editor .cm-content").fill("#include <WiFi.h>\nvoid setup() {}\n");
  await expect(page.locator("#arduino-warning")).toBeVisible();
  await page.locator("#copy-convert").click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("#include <WiFi.h>");
});

test("loads an example and keeps code after reload", async ({ page }) => {
  await mockSerial(page);
  await page.goto("/");
  page.on("dialog", (dialog) => dialog.accept());
  await page.locator("#examples").selectOption({ label: "DHT11 溫濕度警報" });
  await expect(page.locator("#editor .cm-content")).toContainText("dht.DHT11");
  await page.reload();
  await expect(page.locator("#editor .cm-content")).toContainText("dht.DHT11");
});

test("changes the code font size and remembers it", async ({ page }) => {
  await page.goto("/");
  const fontSize = (selector: string) => page.locator(selector).evaluate((node) => getComputedStyle(node).fontSize);

  await expect(page.locator("#font-value")).toHaveText("16");
  await page.locator("#font-up").click();
  await page.locator("#font-up").click();
  await expect(page.locator("#font-value")).toHaveText("20");
  expect(await fontSize(".cm-scroller")).toBe("20px");
  expect(await fontSize("#monitor")).toBe("20px");
  expect(await fontSize("#repl-input")).toBe("20px");

  await page.reload();
  await expect(page.locator("#font-value")).toHaveText("20");
  expect(await fontSize(".cm-scroller")).toBe("20px");

  for (let i = 0; i < 6; i++) await page.locator("#font-up").click();
  await expect(page.locator("#font-value")).toHaveText("32");
  await expect(page.locator("#font-up")).toBeDisabled();
});

test("resizes the editor and monitor by dragging the divider", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/");
  const editorPanel = page.locator('section[aria-label="程式編輯器"]');
  const monitorPanel = page.locator('section[aria-label="序列埠監控窗"]');
  const width = async (panel: typeof editorPanel) => (await panel.boundingBox())!.width;
  const dragTo = async (x: number) => {
    const box = (await page.locator("#splitter").boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
  };

  const defaultWidth = await width(editorPanel);
  await dragTo(400);
  const narrowed = await width(editorPanel);
  expect(narrowed).toBeCloseTo(400 - 16, -1);
  expect(await width(monitorPanel)).toBeGreaterThan(800);

  await page.reload();
  expect(await width(editorPanel)).toBeCloseTo(narrowed, 0);

  await dragTo(5000);
  expect(await page.locator("#splitter").getAttribute("aria-valuenow")).toBe("80");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);

  await page.locator("#splitter").press("ArrowLeft");
  expect(await page.locator("#splitter").getAttribute("aria-valuenow")).toBe("78");

  await page.locator("#splitter").dblclick();
  expect(await width(editorPanel)).toBeCloseTo(defaultWidth, 0);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#splitter")).toBeHidden();
});

test("web LED page takes typed commands and explains a blocked microphone", async ({ page }) => {
  const source = readFileSync("src/examples/web_led.py", "utf8");
  const html = source.match(/PAGE = """([\s\S]*?)"""/)![1];
  const requests: string[] = [];
  await page.route("http://esp32.test/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/") return route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
    requests.push(path);
    return route.fulfill({ contentType: "text/plain", body: "ok" });
  });
  await page.addInitScript(() => {
    (globalThis as any).SpeechRecognition = class {
      onerror!: (event: { error: string }) => void;
      start() {
        this.onerror({ error: "not-allowed" });
      }
    };
  });
  await page.goto("http://esp32.test/");
  expect(await page.evaluate(() => isSecureContext)).toBe(false);

  await page.getByRole("button", { name: "語音控制" }).click();
  await expect(page.locator("#status")).toContainText("不允許這個網址使用麥克風");

  await page.locator("input").fill("開燈");
  await page.locator("input").press("Enter");
  await expect(page.locator("#status")).toContainText("目前模式：on");
  expect(requests).toContain("/on");

  await page.locator("input").fill("關燈");
  await page.getByRole("button", { name: "送出文字指令" }).click();
  await expect(page.locator("#status")).toContainText("目前模式：off");
  expect(requests).toContain("/off");

  await page.locator("input").fill("你好");
  await page.locator("input").press("Enter");
  await expect(page.locator("#status")).toContainText("聽不懂");
});

test("voice page sends spoken commands and shows the board's reply", async ({ page }) => {
  const published: string[] = [];
  await page.routeWebSocket(/broker\.emqx\.io/, (socket) => {
    socket.onMessage((message) => {
      const data = Buffer.from(message as Buffer);
      const type = data[0] >> 4;
      if (type === 1) socket.send(Buffer.from([0x20, 2, 0, 0]));
      if (type === 8) socket.send(Buffer.from([0x90, 3, data[2], data[3], 0]));
      if (type === 12) socket.send(Buffer.from([0xd0, 0]));
      if (type === 3) {
        const topicLength = data.readUInt16BE(2);
        const topic = data.subarray(4, 4 + topicLength).toString();
        const payload = data.subarray(4 + topicLength).toString();
        published.push(`${topic} ${payload}`);
        // Act as the board: answer on the state topic.
        const state = Buffer.from("esp32-mp-class/abc/state");
        const reply = Buffer.from(payload);
        socket.send(Buffer.concat([Buffer.from([0x30, 2 + state.length + reply.length, 0, state.length]), state, reply]));
      }
    });
  });
  await page.addInitScript(() => {
    (globalThis as any).SpeechRecognition = class {
      onresult!: (event: unknown) => void;
      start() {
        this.onresult({ results: [[{ transcript: "開燈" }]] });
      }
    };
  });

  await page.goto("/voice.html");
  await expect(page.locator("#voice")).toBeDisabled();

  await page.locator("#channel").fill("a/b");
  await page.locator("#channel-connect").click();
  await expect(page.locator("#message")).toContainText("只能使用英文");

  await page.locator("#channel").fill("abc");
  await page.locator("#channel-connect").click();
  await expect(page.locator("#link-status")).toContainText("已連線，通道：abc");

  await page.locator("#voice").click();
  await expect(page.locator("#board-status")).toContainText("LED 開啟");
  expect(published).toContain("esp32-mp-class/abc/command on");

  await page.locator('[data-command="blink"]').click();
  await expect(page.locator("#board-status")).toContainText("LED 閃爍");

  await page.locator("#text-command").fill("關燈");
  await page.locator("#text-send").click();
  await expect(page.locator("#board-status")).toContainText("LED 關閉");

  await page.locator("#text-command").fill("你好");
  await page.locator("#text-send").click();
  await expect(page.locator("#message")).toContainText("聽不懂");

  await page.reload();
  await expect(page.locator("#channel")).toHaveValue("abc");
  await expect(page.locator("#link-status")).toContainText("已連線");
});

test("voice page connects to a custom broker and remembers it", async ({ page }) => {
  const urls: string[] = [];
  await page.routeWebSocket(/\/\/(my\.broker\.test|broker\.emqx\.io)/, (socket) => {
    urls.push(socket.url());
    socket.onMessage((message) => {
      const data = Buffer.from(message as Buffer);
      if (data[0] >> 4 === 1) socket.send(Buffer.from([0x20, 2, 0, 0]));
      if (data[0] >> 4 === 8) socket.send(Buffer.from([0x90, 3, data[2], data[3], 0]));
    });
  });

  await page.goto("/voice.html");
  await expect(page.locator("#broker-settings")).not.toHaveAttribute("open");
  await page.locator("#broker-settings summary").click();
  await expect(page.locator("#broker-host")).toHaveValue("broker.emqx.io");

  await page.locator("#channel").fill("my-room");
  await page.locator("#broker-host").fill("my.broker.test");
  await page.locator("#broker-port").fill("abc");
  await page.locator("#channel-connect").click();
  await expect(page.locator("#message")).toContainText("伺服器設定不正確");
  expect(urls).toEqual([]);

  await page.locator("#broker-port").fill("9001");
  await page.locator("#broker-path").fill("/ws");
  await page.locator("#channel-connect").click();
  await expect(page.locator("#link-status")).toContainText("已連線，通道：my-room");
  expect(urls).toEqual(["wss://my.broker.test:9001/ws"]);

  await page.reload();
  await expect(page.locator("#link-status")).toContainText("已連線");
  await expect(page.locator("#broker-settings")).toHaveAttribute("open");
  expect(urls[1]).toBe("wss://my.broker.test:9001/ws");

  await page.locator("#broker-reset").click();
  await page.locator("#channel-connect").click();
  await expect.poll(() => urls.at(-1)).toBe("wss://broker.emqx.io:8084/mqtt");
});

test("voice page reports a broker it cannot reach", async ({ page }) => {
  await page.routeWebSocket(/my\.broker\.test/, (socket) => socket.close());
  await page.goto("/voice.html");
  await page.locator("#broker-settings summary").click();
  await page.locator("#channel").fill("my-room");
  await page.locator("#broker-host").fill("my.broker.test");
  await page.locator("#channel-connect").click();
  await expect(page.locator("#link-status")).toContainText("連不上伺服器");
  await expect(page.locator("#voice")).toBeDisabled();
});

test("MQTT example gets its own channel when loaded", async ({ page }) => {
  await page.goto("/");
  page.on("dialog", (dialog) => dialog.accept());
  await page.locator("#examples").selectOption({ label: "語音控制 LED（MQTT）" });
  const code = await page.evaluate(() => localStorage.getItem("esp32-mp-code"));
  expect(code).not.toContain("{{");
  expect(code).toMatch(/CHANNEL = "led-[0-9a-f]{12}"/);
  expect(code).toContain("/voice.html");
});

for (const path of ["/", "/voice.html"]) {
  test(`shows the copyright links on ${path}`, async ({ page }) => {
    await page.goto(path);
    const copyright = page.locator(".copyright");
    await expect(copyright).toContainText("© 2026 Studio0808 智造實驗室. All rights reserved.");
    await expect(copyright.getByRole("link", { name: "Studio0808 智造實驗室" })).toHaveAttribute("href", "https://begin0808.github.io/studio0808/");
    await expect(copyright.getByRole("link", { name: "寫信給我" })).toHaveAttribute(
      "href",
      "https://mail.google.com/mail/?view=cm&fs=1&to=begin0808@gmail.com",
    );
    await expect(copyright.getByRole("link", { name: "Facebook" })).toHaveAttribute("href", "https://www.facebook.com/begin.li.1/");
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  });
}

test("opens the pinout image and driver page in new tabs", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#driver-link")).toHaveAttribute("href", "https://www.silabs.com/software-and-tools/usb-to-uart-bridge-vcp-drivers?tab=downloads");
  await expect(page.locator("#driver-link")).toHaveAttribute("target", "_blank");

  const [tab] = await Promise.all([page.waitForEvent("popup"), page.locator("#pinout-link").click()]);
  const size = await tab.evaluate(async () => {
    const image = document.querySelector("img")!;
    await image.decode();
    return image.naturalWidth;
  });
  expect(size).toBe(1029);
});

test("explains when the browser has no Web Serial", async ({ page }) => {
  await page.addInitScript(() => {
    delete (Navigator.prototype as any).serial;
  });
  await page.goto("/");
  await expect(page.locator("#unsupported")).toBeVisible();
  await expect(page.locator("#connect")).toBeDisabled();
});

test("reports an unplugged board", async ({ page }) => {
  await mockSerial(page);
  await page.goto("/");
  await page.locator("#connect").click();
  await expect(page.locator("#upload")).toBeEnabled();
  await page.evaluate(() => {
    const board = (globalThis as any).board;
    board.unplug();
  });
  await expect(page.locator("#status")).toContainText("連線中斷");
  await expect(page.locator("#upload")).toBeDisabled();
});

test("serves the complete firmware file", async ({ page }) => {
  await page.goto("/");
  const size = await page.evaluate(async () => {
    const response = await fetch("./firmware/ESP32_GENERIC-20260824-v1.29.0.bin");
    return (await response.arrayBuffer()).byteLength;
  });
  expect(size).toBe(1790544);
});
