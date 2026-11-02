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

/** Style, font size and links live in a collapsed panel. Safe to call when it is already open. */
async function openSettings(page: Page) {
  if (!(await page.locator("#settings-panel").isVisible())) await page.locator("#settings-button").click();
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
  await page.locator("#examples").selectOption({ label: "18. DHT11 溫濕度警報" });
  await expect(page.locator("#editor .cm-content")).toContainText("dht.DHT11");
  await page.reload();
  await expect(page.locator("#editor .cm-content")).toContainText("dht.DHT11");
});

test("changes the code font size and remembers it", async ({ page }) => {
  await page.goto("/");
  const fontSize = (selector: string) => page.locator(selector).evaluate((node) => getComputedStyle(node).fontSize);

  await expect(page.locator("#font-value")).toHaveText("14");
  await openSettings(page);
  await page.locator("#font-up").click();
  await page.locator("#font-up").click();
  await expect(page.locator("#font-value")).toHaveText("18");
  expect(await fontSize(".cm-scroller")).toBe("18px");
  expect(await fontSize("#monitor")).toBe("18px");
  expect(await fontSize("#repl-input")).toBe("18px");

  await page.reload();
  await expect(page.locator("#font-value")).toHaveText("18");
  expect(await fontSize(".cm-scroller")).toBe("18px");

  await openSettings(page);
  for (let i = 0; i < 7; i++) await page.locator("#font-up").click();
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
  await expect(page.locator("#link-status")).toContainText("已連線，主題：abc");
  await expect(page.locator("#topic-preview")).toContainText("esp32-mp-class/abc/command");

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
  await expect(page.locator("#link-status")).toContainText("已連線，主題：my-room");
  expect(urls).toEqual(["wss://my.broker.test:9001/ws"]);

  await page.reload();
  await expect(page.locator("#link-status")).toContainText("已連線");
  await expect(page.locator("#broker-settings")).toHaveAttribute("open");
  expect(urls[1]).toBe("wss://my.broker.test:9001/ws");

  await page.locator("#broker-reset").click();
  await page.locator("#channel-connect").click();
  await expect.poll(() => urls.at(-1)).toBe("wss://broker.emqx.io:8084/mqtt");
});

test("voice page logs in to a broker without saving the password", async ({ page }) => {
  const logins: string[] = [];
  await page.routeWebSocket(/my\.broker\.test/, (socket) => {
    socket.onMessage((message) => {
      const data = Buffer.from(message as Buffer);
      if (data[0] >> 4 === 1) {
        const login = data.toString("latin1");
        logins.push(login);
        socket.send(Buffer.from([0x20, 2, 0, login.includes("right-pass") ? 0 : 4]));
      }
      if (data[0] >> 4 === 8) socket.send(Buffer.from([0x90, 3, data[2], data[3], 0]));
    });
  });

  await page.goto("/voice.html");
  await page.locator("#broker-settings summary").click();
  await page.locator("#channel").fill("my-room");
  await page.locator("#broker-host").fill("my.broker.test");

  await page.locator("#broker-password").fill("right-pass");
  await page.locator("#channel-connect").click();
  await expect(page.locator("#message")).toContainText("也要填帳號");
  expect(logins).toEqual([]);

  await page.locator("#broker-user").fill("teacher");
  await page.locator("#broker-password").fill("wrong-pass");
  await page.locator("#channel-connect").click();
  await expect(page.locator("#link-status")).toContainText("帳號或密碼不正確");
  await expect(page.locator("#voice")).toBeDisabled();
  await page.waitForTimeout(3500);
  expect(logins).toHaveLength(1);

  await page.locator("#broker-password").fill("right-pass");
  await page.locator("#channel-connect").click();
  await expect(page.locator("#link-status")).toContainText("已連線");
  expect(logins[1]).toContain("teacher");
  expect(logins[1]).toContain("right-pass");

  const stored = await page.evaluate(() => JSON.stringify(localStorage));
  expect(stored).toContain("teacher");
  expect(stored).not.toContain("pass");

  await page.reload();
  await expect(page.locator("#broker-settings")).toHaveAttribute("open");
  await expect(page.locator("#broker-user")).toHaveValue("teacher");
  await expect(page.locator("#message")).toContainText("請輸入 MQTT 密碼");
  await expect(page.locator("#link-status")).toContainText("尚未連線");
  expect(logins).toHaveLength(2);

  await page.locator("#broker-reset").click();
  await expect(page.locator("#broker-user")).toHaveValue("");
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
  await page.locator("#examples").selectOption({ label: "17. 語音控制 LED（MQTT）" });
  const code = await page.evaluate(() => localStorage.getItem("esp32-mp-code"));
  expect(code).not.toContain("{{");
  expect(code).toMatch(/TOPIC_NAME = "led-[0-9a-f]{12}"/);
  expect(code).toContain("/voice.html");
});

for (const path of ["/", "/voice.html", "/help.html"]) {
  test(`shows the visit count on ${path} without recording a local visit`, async ({ page }) => {
    const requests: string[] = [];
    await page.route("https://esp32lab.goatcounter.com/**", (route) => {
      requests.push(route.request().url());
      return route.fulfill({ json: { count: "1,234" }, headers: { "Access-Control-Allow-Origin": "*" } });
    });
    await page.goto(path);
    await expect(page.locator("#visit-count")).toHaveText("累計瀏覽 1,234 人次");
    expect(requests).toEqual(["https://esp32lab.goatcounter.com/counter//esp32Lab.json?start=2026-01-01"]);
    const isLast = await page.locator("#visit-count").evaluate((node) => node.nextElementSibling === null);
    expect(isLast).toBe(true);
  });

  test(`leaves out the visit count on ${path} when it is unavailable`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("https://esp32lab.goatcounter.com/**", (route) => route.abort());
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("#visit-count")).toBeHidden();
    expect(errors).toEqual([]);
  });

  test(`shows the copyright links on ${path}`, async ({ page }) => {
    await page.goto(path);
    const copyright = page.locator(".copyright");
    await expect(copyright).toContainText("© 2026 Studio0808 智造實驗室. All rights reserved.");
    await expect(copyright).toContainText("如有建議或報錯，歡迎來信");
    await expect(copyright.getByRole("link", { name: "Studio0808 智造實驗室" })).toHaveAttribute("href", "https://begin0808.github.io/studio0808/");
    await expect(copyright.getByRole("link", { name: "寫信給我" })).toHaveAttribute(
      "href",
      "https://mail.google.com/mail/?view=cm&fs=1&to=begin0808@gmail.com",
    );
    await expect(copyright.getByRole("link", { name: "Facebook" })).toHaveAttribute("href", "https://www.facebook.com/begin.li.1/");
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  });
}

const STYLE_IDS = ["mat", "blocks"];

/** WCAG contrast of two computed "rgb(r, g, b)" colours. */
function contrast(first: string, second: string): number {
  const luminance = (color: string) => {
    const [r, g, b] = color.match(/[\d.]+/g)!.slice(0, 3).map((value) => {
      const channel = Number(value) / 255;
      return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

test("switches style across pages without touching the code", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-style", "mat");
  await page.locator("#editor .cm-content").fill('print("保留")\n');

  await openSettings(page);
  for (const id of STYLE_IDS) {
    await page.locator("#style-picker").selectOption(id);
    await expect(page.locator("html")).toHaveAttribute("data-style", id);
    await expect(page.locator("#editor .cm-content")).toContainText("保留");
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  }

  await page.locator("#style-picker").selectOption("blocks");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-style", "blocks");
  await expect(page.locator("#style-picker")).toHaveValue("blocks");
  await page.goto("/voice.html");
  await expect(page.locator("html")).toHaveAttribute("data-style", "blocks");
});

test("falls back to the default when a removed style was saved", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("esp32-mp-style", "pcb"));
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-style", "mat");
  await expect(page.locator("#style-picker")).toHaveValue("mat");
  await expect(page.locator("#style-picker option")).toHaveText(["切割墊工作台", "積木玩具"]);
});

test("downloads a style's font only when that style is chosen", async ({ page }) => {
  const fonts: string[] = [];
  page.on("request", (request) => {
    if (/\.woff2?($|\?)/.test(request.url())) fonts.push(request.url());
  });
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  expect(fonts).toEqual([]);

  await openSettings(page);
  await page.locator("#style-picker").selectOption("blocks");
  await expect.poll(() => fonts.some((url) => url.includes("huninn"))).toBe(true);
});

for (const id of STYLE_IDS) {
  test(`style ${id} keeps text readable`, async ({ page }) => {
    await page.addInitScript((style) => localStorage.setItem("esp32-mp-style", style), id);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-style", id);

    const read = (name: string) =>
      page.evaluate((token) => {
        const probe = document.createElement("span");
        probe.style.color = `var(${token})`;
        document.body.append(probe);
        const color = getComputedStyle(probe).color;
        probe.remove();
        return color;
      }, name);

    for (const [text, background] of [
      ["--text", "--surface"],
      ["--muted", "--surface"],
      ["--code-text", "--code-bg"],
      ["--code-keyword", "--code-bg"],
      ["--code-string", "--code-bg"],
      ["--code-comment", "--code-bg"],
      ["--code-number", "--code-bg"],
      ["--code-gutter-text", "--code-gutter"],
      ["--monitor-text", "--monitor-bg"],
      ["--monitor-system", "--monitor-bg"],
      ["--head-text", "--head-bg"],
      ["--head-text", "--head-alt-bg"],
      ["--btn-text", "--btn-bg"],
      ["--go-text", "--go-bg"],
      ["--page-title", "--page-bg"],
      ["--page-text", "--page-bg"],
      ["--page-muted", "--page-bg"],
      ["--page-link", "--page-bg"],
      ["--accent-text", "--surface"],
      ["--link", "--surface"],
    ]) {
      expect(contrast(await read(text), await read(background)), `${id}: ${text} on ${background}`).toBeGreaterThanOrEqual(4.5);
    }
  });
}

for (const [path, icon] of [
  ["/", "logo"],
  ["/voice.html", "voice"],
]) {
  test(`shows the ${icon} logo in the tab and header of ${path}`, async ({ page, request }) => {
    await page.goto(path);
    const links = page.locator('link[rel="icon"], link[rel="apple-touch-icon"]');
    await expect(links).toHaveCount(3);
    for (const href of await links.evaluateAll((nodes) => nodes.map((node) => (node as HTMLLinkElement).href))) {
      expect(href).toContain(`/icons/${icon}`);
      expect((await request.get(href)).ok()).toBe(true);
    }
    const width = await page.locator(".brand-logo").evaluate(async (node) => {
      const image = node as HTMLImageElement;
      await image.decode();
      return image.naturalWidth;
    });
    expect(width).toBeGreaterThan(0);
  });
}

test("help page opens in a new tab and follows the chosen style", async ({ page, context }) => {
  await page.goto("/");
  await openSettings(page);
  await page.locator("#style-picker").selectOption("blocks");

  const [help] = await Promise.all([context.waitForEvent("page"), page.locator("#help-link").click()]);
  await help.waitForLoadState();
  await expect(help).toHaveTitle(/使用說明/);
  await expect(help.locator("html")).toHaveAttribute("data-style", "blocks");
  await expect(help.locator("#style-picker")).toHaveValue("blocks");

  // Changing the style in the editor also updates the help page that is already open.
  await openSettings(page);
  await page.locator("#style-picker").selectOption("mat");
  await expect(help.locator("html")).toHaveAttribute("data-style", "mat");
  await expect(help.locator("#style-picker")).toHaveValue("mat");
});

test("marks the site as a beta version and asks for feedback", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1 .beta")).toHaveText("測試 Beta 版");
  await page.goto("/help.html");
  // The choice of MicroPython decides everything else, so it comes before any section.
  await expect(page.locator(".doc > .tip").first()).toContainText("本網站採用 MicroPython");
  const notice = page.locator("#beta-notice");
  await expect(notice).toContainText("尚未逐一實測");
  await expect(notice.getByRole("link", { name: "寫信告訴我" })).toHaveAttribute(
    "href",
    "https://mail.google.com/mail/?view=cm&fs=1&to=begin0808@gmail.com",
  );
});

for (const [id, path] of [["help-link", "/help.html"], ["voice-link", "/voice.html"]]) {
  test(`returns from ${path} to the editor that opened it, without reloading it`, async ({ page, context }) => {
    await page.goto("/");
    await page.locator("#editor .cm-content").fill('print("保留")\n');
    await page.evaluate(() => ((globalThis as any).sameEditor = true));
    await openSettings(page);
    const [opened] = await Promise.all([context.waitForEvent("page"), page.locator(`#${id}`).click()]);
    await opened.waitForLoadState();
    await Promise.all([opened.waitForEvent("close"), opened.locator("#home-link").click()]);
    expect(context.pages()).toEqual([page]);
    await page.bringToFront();
    expect(await page.evaluate(() => (globalThis as any).sameEditor)).toBe(true);
    await expect(page.locator("#editor .cm-content")).toContainText("保留");
  });

  test(`${path} opened on its own links to the editor`, async ({ page }) => {
    await page.goto(path);
    await page.locator("#home-link").click();
    await expect(page.locator("#connect")).toBeVisible();
  });
}

test("voice page returns to the help page's own opener, not the editor, only when it should", async ({ page, context }) => {
  // A help tab opened from the voice page has no editor to go back to, so it navigates instead of closing.
  await page.goto("/voice.html");
  const [help] = await Promise.all([context.waitForEvent("page"), page.locator("#help-link").click()]);
  await help.waitForLoadState();
  await help.locator("#home-link").click();
  await expect(help.locator("#connect")).toBeVisible();
});

test("voice page links to the help page", async ({ page }) => {
  await page.goto("/voice.html");
  await expect(page.locator("#help-link")).toHaveAttribute("href", "./help.html");
});

for (const id of STYLE_IDS) {
  test(`help page reads well in style ${id}`, async ({ page, request }) => {
    await page.addInitScript((style) => localStorage.setItem("esp32-mp-style", style), id);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/help.html");
    await expect(page.locator("html")).toHaveAttribute("data-style", id);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);

    for (const anchor of await page.locator(".toc a").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")!))) {
      await expect(page.locator(anchor)).toHaveCount(1);
    }
    for (const badge of await page.locator(".badge").all()) {
      const colors = await badge.evaluate((node) => {
        const style = getComputedStyle(node);
        return [style.color, style.backgroundColor];
      });
      expect(contrast(colors[0], colors[1])).toBeGreaterThanOrEqual(4.5);
    }
    for (const href of await page.locator('.doc a[href^="./"]').evaluateAll((nodes) => nodes.map((node) => (node as HTMLAnchorElement).href))) {
      expect((await request.get(href)).ok(), href).toBe(true);
    }
  });
}

test("offers every example, grouped, and loads the wiring notes into the editor", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#examples optgroup")).toHaveCount(4);
  await expect(page.locator("#examples optgroup option")).toHaveCount(20);
  page.on("dialog", (dialog) => dialog.accept());
  await page.locator("#examples").selectOption({ label: "13. SSD1306 OLED 顯示器" });
  await expect(page.locator("#editor .cm-content")).toContainText("class SSD1306");
  await page.locator("#examples").selectOption({ label: "20. DHT11 資料存到 Google 試算表" });
  await expect(page.locator("#editor .cm-content")).toContainText("YOUR_SCRIPT_URL");
  await page.locator("#examples").selectOption({ label: "15. MAX7219 點矩陣" });
  await expect(page.locator("#editor .cm-content")).toContainText("class MAX7219");
});

test("moves example pins to the chosen chip", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  page.on("dialog", (dialog) => dialog.accept());
  await expect(page.locator("#chip")).toHaveValue("esp32");
  await page.locator("#chip").selectOption({ label: "ESP32-C3" });
  await page.locator("#examples").selectOption({ label: "2. 按鈕開關 LED" });
  await expect(page.locator("#editor .cm-content")).toContainText("LED_PIN = 4");
  await expect(page.locator("#editor .cm-content")).toContainText("BUTTON_PIN = 5");

  await page.locator("#copy-prompt").click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("開發板：ESP32-C3");

  await page.reload();
  await expect(page.locator("#chip")).toHaveValue("esp32c3");
});

test("runs over built-in USB without resetting the port", async ({ page }) => {
  await mockSerial(page, {
    machine: "Generic ESP32S3 module with ESP32S3",
    usb: { usbVendorId: 0x303a, usbProductId: 0x4001 },
  });
  await page.goto("/");
  await page.locator("#connect").click();
  await expect(page.locator("#status")).toContainText("ESP32S3");
  await expect(page.locator("#chip")).toHaveValue("esp32s3");
  await expect(page.locator("#monitor")).toContainText("之後選範例會使用這種晶片的腳位");
  expect(await page.evaluate(() => (globalThis as any).board.dtr)).toBe(true);

  await page.locator("#editor .cm-content").fill('print("IP 測試")\n');
  await page.locator("#upload").click();
  await expect(page.locator("#ip-link")).toHaveText("http://192.168.1.105");
  const board = await page.evaluate(() => {
    const { resets, softResets } = (globalThis as any).board;
    return { resets, softResets };
  });
  expect(board).toEqual({ resets: 0, softResets: 1 });
});

test("keeps DTR low on a board with a USB-to-serial chip", async ({ page }) => {
  await mockSerial(page);
  await page.goto("/");
  await page.locator("#connect").click();
  await expect(page.locator("#status")).toContainText("Generic ESP32 module");
  expect(await page.evaluate(() => (globalThis as any).board.dtr)).toBe(false);
  await expect(page.locator("#chip")).toHaveValue("esp32");
});

test("keeps settings and links in a panel that closes", async ({ page }) => {
  await page.goto("/");
  const panel = page.locator("#settings-panel");
  await expect(panel).toBeHidden();
  await expect(page.locator(".actions > *")).toHaveText(["連接開發板", "安裝韌體", "上傳並執行", "停止", "設定與說明"]);

  await page.locator("#settings-button").click();
  await expect(panel).toBeVisible();
  // Changes apply right away and leave the panel open.
  await page.locator("#font-up").click();
  await expect(page.locator("#font-value")).toHaveText("16");
  await page.locator("#style-picker").selectOption("blocks");
  await expect(page.locator("html")).toHaveAttribute("data-style", "blocks");
  await expect(panel).toBeVisible();

  await page.locator("#settings-close").click();
  await expect(panel).toBeHidden();

  await page.locator("#settings-button").click();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();

  await page.locator("#settings-button").click();
  await page.mouse.click(40, 400);
  await expect(panel).toBeHidden();
});

for (const [width, height] of [[1366, 768], [760, 700], [390, 700], [1366, 400]]) {
  test(`settings panel fits a ${width}x${height} window`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.locator("#settings-button").click();
    const box = (await page.locator("#settings-panel").boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y + box.height).toBeLessThanOrEqual(height);
    await page.locator("#ch340-link").scrollIntoViewIfNeeded();
    await expect(page.locator("#ch340-link")).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  });
}

test("opens the pinout image and driver pages in new tabs", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#driver-link")).toHaveAttribute("href", "https://www.silabs.com/software-and-tools/usb-to-uart-bridge-vcp-drivers?tab=downloads");
  await expect(page.locator("#driver-link")).toHaveAttribute("target", "_blank");
  await expect(page.locator("#ch340-link")).toHaveAttribute("href", "https://www.wch-ic.com/downloads/CH341SER_EXE.html");
  await expect(page.locator("#ch340-link")).toHaveAttribute("target", "_blank");

  await openSettings(page);

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

test.describe("serial monitor", () => {
  const MONITOR_LIMIT = 200_000;

  async function connectBoard(page: Page) {
    await mockSerial(page);
    await page.goto("/");
    await page.locator("#connect").click();
    await expect(page.locator("#upload")).toBeEnabled();
  }

  /** Sends `count` lines of about 20 characters, one read per line, as a program printing in a loop would. */
  async function printLines(page: Page, from: number, count: number) {
    await page.evaluate(
      ([start, total]) => {
        const board = (globalThis as any).board;
        for (let i = start; i < start + total; i++) board.emit(`reading ${String(i).padStart(8, "0")}\r\n`);
      },
      [from, count],
    );
  }

  test("keeps up with a program that prints very fast", async ({ page }) => {
    await connectBoard(page);
    await printLines(page, 0, 5000);
    await expect(page.locator("#monitor")).toContainText("reading 00004999");
    // One text node per read would make the page slow; the output is drawn in batches instead.
    expect(await page.locator("#monitor").evaluate((node) => node.childNodes.length)).toBeLessThan(100);
  });

  test("still finds the address after a long run of output", async ({ page }) => {
    await connectBoard(page);
    await printLines(page, 0, 12_000);
    await expect(page.locator("#monitor")).toContainText("reading 00011999");
    await page.evaluate(() => (globalThis as any).board.emit("IP: 10.0.0.7\r\n"));
    await expect(page.locator("#ip-link")).toHaveText("http://10.0.0.7");
  });

  test("drops the oldest output but keeps the colour of recent system messages", async ({ page }) => {
    await connectBoard(page);
    await printLines(page, 0, 7000);
    // A block sent while a program runs is refused with a system message.
    await page.locator("#repl-input").fill("for i in range(3):\n    print(i)");
    await page.locator("#repl-input").press("Control+Enter");
    await expect(page.locator("#monitor .system").filter({ hasText: "請先按「停止」" })).toHaveCount(1);
    await printLines(page, 7000, 5000);
    await expect(page.locator("#monitor")).toContainText("reading 00011999");

    const text = (await page.locator("#monitor").textContent()) ?? "";
    expect(text.length).toBeLessThanOrEqual(MONITOR_LIMIT);
    expect(text).not.toContain("reading 00000000");
    await expect(page.locator("#monitor .system").filter({ hasText: "請先按「停止」" })).toHaveCount(1);
  });
});

test.describe("chart", () => {
  async function connectBoard(page: Page) {
    await mockSerial(page);
    await page.goto("/");
    await page.locator("#connect").click();
    await expect(page.locator("#upload")).toBeEnabled();
  }

  /** Starts on a new line, because the board's ">>> " prompt has no line end and a line joined to it is skipped. */
  async function print(page: Page, lines: string[]) {
    await page.evaluate((all) => {
      const board = (globalThis as any).board;
      board.emit("\r\n");
      for (const line of all) board.emit(`${line}\r\n`);
    }, lines);
  }

  const legend = (page: Page) => page.locator("#plot-legend .plot-key");

  test("draws the values an example prints and lists them with their newest value", async ({ page }) => {
    await connectBoard(page);
    await page.locator("#view-plot").click();
    await expect(page.locator("#plot-empty")).toBeVisible();
    await expect(page.locator("#plot-export")).toBeDisabled();
    await expect(page.locator("#monitor")).toBeHidden();

    await print(page, ["溫度: 25 °C  濕度: 60 %", "讀取失敗，請檢查接線", "溫度: 26 °C  濕度: 58 %"]);
    await expect(legend(page)).toHaveText(["溫度26", "濕度58"]);
    await expect(page.locator("#plot-empty")).toBeHidden();
    await expect(page.locator("#plot-export")).toBeEnabled();
    // The first line's colour must appear on the canvas.
    await expect
      .poll(() =>
        page.locator("#plot-canvas").evaluate((canvas: HTMLCanvasElement) => {
          const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
          for (let i = 0; i < data.length; i += 4) if (data[i] > 240 && data[i + 1] > 195 && data[i + 1] < 225 && data[i + 2] < 90) return true;
          return false;
        }),
      )
      .toBe(true);

    await page.locator("#view-text").click();
    await expect(page.locator("#plot-view")).toBeHidden();
    await expect(page.locator("#monitor")).toContainText("溫度: 26 °C");
  });

  test("keeps recording while the text view is shown", async ({ page }) => {
    await connectBoard(page);
    await print(page, ["1 2", "3 4"]);
    await page.locator("#view-plot").click();
    await expect(legend(page)).toHaveText(["數值13", "數值24"]);
  });

  test("exports the data as CSV", async ({ page }) => {
    await connectBoard(page);
    await print(page, ["溫度: 25 °C  濕度: 60 %", "距離: 12.5 公分"]);
    await page.locator("#view-plot").click();
    await expect(legend(page)).toHaveCount(3);
    const [download] = await Promise.all([page.waitForEvent("download"), page.locator("#plot-export").click()]);
    expect(download.suggestedFilename()).toMatch(/^esp32-data-\d{8}-\d{6}\.csv$/);
    const csv = readFileSync((await download.path())!, "utf8");
    const rows = csv.replace(/^﻿/, "").trim().split("\r\n");
    expect(csv.startsWith("﻿")).toBe(true);
    expect(rows[0]).toBe("時間（秒）,溫度,濕度,距離");
    expect(rows[1]).toMatch(/^0\.000,25,60,$/);
    expect(rows[2]).toMatch(/^\d+\.\d{3},,,12\.5$/);
  });

  test("pauses the picture, hides a line and clears only the chart", async ({ page }) => {
    await connectBoard(page);
    await print(page, ["a: 1 b: 2"]);
    await page.locator("#view-plot").click();
    await page.locator("#plot-pause").click();
    await expect(page.locator("#plot-pause")).toHaveText("繼續");
    await expect(page.locator("#plot-note")).toContainText("暫停");
    await print(page, ["a: 5 b: 6"]);
    // The values keep being recorded while the picture is paused.
    await expect(legend(page)).toHaveText(["a5", "b6"]);
    await page.locator("#plot-pause").click();
    await expect(page.locator("#plot-note")).toBeHidden();

    await legend(page).first().click();
    await expect(legend(page).first()).toHaveAttribute("aria-pressed", "false");

    page.once("dialog", (dialog) => dialog.dismiss());
    await page.locator("#clear").click();
    await expect(legend(page)).toHaveCount(2);
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("#clear").click();
    await expect(legend(page)).toHaveCount(0);
    await expect(page.locator("#plot-empty")).toBeVisible();
    await page.locator("#view-text").click();
    await expect(page.locator("#monitor")).toContainText("a: 5 b: 6");
  });

  test("keeps up with a program that prints values very fast", async ({ page }) => {
    await connectBoard(page);
    await page.locator("#view-plot").click();
    await page.evaluate(() => {
      const board = (globalThis as any).board;
      board.emit("\r\n");
      for (let i = 0; i < 20_000; i++) board.emit(`value: ${i}\r\n`);
    });
    await expect(legend(page)).toHaveText(["value19999"]);
  });
});

test("serves the complete firmware file", async ({ page }) => {
  await page.goto("/");
  const size = await page.evaluate(async () => {
    const response = await fetch("./firmware/ESP32_GENERIC-20260824-v1.29.0.bin");
    return (await response.arrayBuffer()).byteLength;
  });
  expect(size).toBe(1790544);
});

const CHINESE = /[　-〿㐀-鿿＀-￯]/;

/** Everything a student can read, including closed dialogs and menus. Only the language picker keeps its Chinese name. */
function chineseLeftOnPage(page: Page) {
  return page.evaluate((source) => {
    const pattern = new RegExp(source);
    const copy = document.documentElement.cloneNode(true) as HTMLElement;
    copy.querySelectorAll("script, style, .language-picker").forEach((node) => node.remove());
    const found = [document.title, document.querySelector('meta[name="description"]')!.getAttribute("content")!];
    const walker = document.createTreeWalker(copy.querySelector("body")!, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) found.push(walker.currentNode.nodeValue!);
    for (const node of copy.querySelectorAll("*")) {
      for (const name of ["placeholder", "aria-label", "title", "alt"]) found.push(node.getAttribute(name) ?? "");
    }
    return found.filter((text) => pattern.test(text));
  }, CHINESE.source);
}

test.describe("in an English browser", () => {
  test.use({ locale: "en-US" });

  for (const path of ["/", "/voice.html", "/help.html"]) {
    test(`${path} shows no Chinese`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      await expect(page.locator("body")).toBeVisible();
      expect(await chineseLeftOnPage(page)).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    });
  }

  test("opens the English help page and keeps the section asked for", async ({ page }) => {
    await page.goto("/help.html#faq");
    await expect(page).toHaveURL(/help\.en\.html#faq$/);
    await expect(page).toHaveTitle(/Help/);
  });

  test("the English help page has the same sections and links as the Chinese one", async ({ page, request }) => {
    const outline = () => page.evaluate(() => [...document.querySelectorAll(".toc a, section[id], h3[id]")].map((node) => node.getAttribute("href") ?? node.id));
    const rows = () => page.locator(".doc tbody tr").count();
    await page.goto("/help.en.html");
    const [english, englishRows] = [await outline(), await rows()];
    for (const href of await page.locator('.doc a[href^="./"]').evaluateAll((nodes) => nodes.map((node) => (node as HTMLAnchorElement).href))) {
      expect((await request.get(href)).ok(), href).toBe(true);
    }
    await page.evaluate(() => localStorage.setItem("esp32-mp-lang", "zh-Hant"));
    await page.goto("/help.html");
    expect(await outline()).toEqual(english);
    expect(await rows()).toBe(englishRows);
  });

  test("connects, uploads and reports in English", async ({ page }) => {
    await mockSerial(page);
    await page.goto("/");
    await expect(page.locator("#connect")).toHaveText("Connect board");
    await expect(page.locator("#status")).toHaveText("Board not connected");
    await page.locator("#connect").click();
    await expect(page.locator("#status")).toContainText("4 MB flash");
    await expect(page.locator("#connect")).toHaveText("Disconnect");
    await page.locator("#upload").click();
    await expect(page.locator("#status")).toContainText("Program running");
    await page.locator("#stop").click();
    await expect(page.locator("#status")).toHaveText("Program stopped");
  });

  test("asks in English to install firmware", async ({ page }) => {
    await mockSerial(page, { hasMicroPython: false });
    await page.goto("/");
    await page.locator("#connect").click();
    await expect(page.locator("#status")).toContainText("install the firmware first", { timeout: 20_000 });
    await expect(page.locator("#monitor")).toContainText('press "Install firmware"');
    expect(CHINESE.test(await page.locator("#monitor").innerText())).toBe(false);
  });

  test("starts with and loads English examples and copies an English prompt", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/");
    await expect(page.locator("#editor .cm-content")).toContainText("Blink an LED");
    await expect(page.locator("#examples optgroup option")).toHaveCount(20);

    page.on("dialog", (dialog) => dialog.accept());
    await page.locator("#examples").selectOption({ label: "17. Voice-controlled LED (MQTT)" });
    await expect(page.locator("#editor .cm-content")).toContainText("Connected to the MQTT broker");
    const code = await page.evaluate(() => localStorage.getItem("esp32-mp-code"));
    expect(code).toMatch(/TOPIC_NAME = "led-[0-9a-f]{12}"/);
    expect(CHINESE.test(code!)).toBe(false);

    await page.locator("#copy-prompt").click();
    const prompt = await page.evaluate(() => navigator.clipboard.readText());
    expect(prompt).toContain("MicroPython, not Arduino C++");
    expect(CHINESE.test(prompt)).toBe(false);
  });

  test("the voice page listens in English and understands English commands", async ({ page }) => {
    await page.routeWebSocket(/broker\.emqx\.io/, (socket) => {
      socket.onMessage((message) => {
        const data = Buffer.from(message as Buffer);
        const type = data[0] >> 4;
        if (type === 1) socket.send(Buffer.from([0x20, 2, 0, 0]));
        if (type === 8) socket.send(Buffer.from([0x90, 3, data[2], data[3], 0]));
        if (type === 3) {
          const topicLength = data.readUInt16BE(2);
          const state = Buffer.from("esp32-mp-class/abc/state");
          const reply = data.subarray(4 + topicLength);
          socket.send(Buffer.concat([Buffer.from([0x30, 2 + state.length + reply.length, 0, state.length]), state, reply]));
        }
      });
    });
    await page.addInitScript(() => {
      (globalThis as any).SpeechRecognition = class {
        lang = "";
        onresult!: (event: unknown) => void;
        start() {
          (globalThis as any).heardIn = this.lang;
          this.onresult({ results: [[{ transcript: "Turn the light on" }]] });
        }
      };
    });
    await page.goto("/voice.html");
    await page.locator("#channel").fill("abc");
    await page.locator("#channel-connect").click();
    await expect(page.locator("#link-status")).toHaveText("Connected, topic: abc");
    await page.locator("#voice").click();
    await expect(page.locator("#board-status")).toHaveText("Board: LED on");
    expect(await page.evaluate(() => (globalThis as any).heardIn)).toBe("en-US");
    await page.locator("#text-command").fill("hello");
    await page.locator("#text-send").click();
    await expect(page.locator("#message")).toContainText("Did not understand");
  });

  test("the English web LED page takes English commands", async ({ page }) => {
    const source = readFileSync("src/examples/en/web_led.py", "utf8");
    const html = source.match(/PAGE = """([\s\S]*?)"""/)![1];
    const requests: string[] = [];
    await page.route("http://esp32.test/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/") return route.fulfill({ contentType: "text/html; charset=utf-8", body: html });
      requests.push(path);
      return route.fulfill({ contentType: "text/plain", body: "ok" });
    });
    await page.goto("http://esp32.test/");
    for (const [command, path] of [["Turn it on.", "/on"], ["off", "/off"], ["blink", "/blink"]]) {
      await page.locator("input").fill(command);
      await page.locator("input").press("Enter");
      await expect.poll(() => requests.at(-1)).toBe(path);
    }
    await page.locator("input").fill("button");
    await page.locator("input").press("Enter");
    await expect(page.locator("#status")).toContainText("Did not understand");
  });

  test("a saved Chinese choice wins over the browser's language", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("esp32-mp-lang", "zh-Hant"));
    await page.goto("/");
    await expect(page.locator("#connect")).toHaveText("連接開發板");
    await page.goto("/help.html");
    await expect(page).toHaveURL(/\/help\.html$/);
  });
});

test.describe("choosing a language", () => {
  test("follows a Chinese browser by default", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hant");
    await expect(page.locator("#connect")).toHaveText("連接開發板");
    await openSettings(page);
    await expect(page.locator("#language-picker")).toHaveValue("zh-Hant");
  });

  test("switches every page, keeps the code and comes back", async ({ page }) => {
    await page.goto("/");
    await page.locator("#editor .cm-content").fill('print("保留")\n');
    await openSettings(page);
    await page.locator("#language-picker").selectOption("en");
    await expect(page.locator("#connect")).toHaveText("Connect board");
    await expect(page.locator("#editor .cm-content")).toContainText("保留");

    await page.goto("/voice.html");
    await expect(page.locator("h1")).toHaveText("ESP32 Voice Control");
    await page.goto("/help.html");
    await expect(page).toHaveURL(/help\.en\.html$/);

    await page.locator("#language-picker").selectOption("zh-Hant");
    await expect(page).toHaveURL(/\/help\.html$/);
    await expect(page.locator("h1")).toContainText("使用說明");
    await page.goto("/");
    await expect(page.locator("#connect")).toHaveText("連接開發板");
  });

  test("asks before a switch would drop the board connection", async ({ page }) => {
    await mockSerial(page);
    await page.goto("/");
    await page.locator("#connect").click();
    await expect(page.locator("#upload")).toBeEnabled();

    page.once("dialog", (dialog) => dialog.dismiss());
    await openSettings(page);
    await page.locator("#language-picker").selectOption("en");
    await expect(page.locator("#language-picker")).toHaveValue("zh-Hant");
    await expect(page.locator("#upload")).toBeEnabled();
    expect(await page.evaluate(() => localStorage.getItem("esp32-mp-lang"))).toBeNull();

    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("#language-picker").selectOption("en");
    await expect(page.locator("#connect")).toHaveText("Connect board");
  });

  test("a connected editor is not reloaded by a change in another tab", async ({ page, context }) => {
    await mockSerial(page);
    await page.goto("/");
    await page.locator("#connect").click();
    await expect(page.locator("#upload")).toBeEnabled();
    await page.evaluate(() => ((globalThis as any).sameEditor = true));

    const help = await context.newPage();
    await help.goto("/help.html");
    await help.locator("#language-picker").selectOption("en");
    await expect(help).toHaveURL(/help\.en\.html$/);

    await page.waitForTimeout(300);
    expect(await page.evaluate(() => (globalThis as any).sameEditor)).toBe(true);
    await expect(page.locator("#upload")).toBeEnabled();
  });

  test("an idle help page follows a change in the editor", async ({ page, context }) => {
    const help = await context.newPage();
    await help.goto("/help.html");
    await page.goto("/");
    await openSettings(page);
    await page.locator("#language-picker").selectOption("en");
    await expect(help).toHaveURL(/help\.en\.html$/);
    await page.locator("#settings-button").click();
    await page.locator("#language-picker").selectOption("zh-Hant");
    await expect(help).toHaveURL(/\/help\.html$/);
  });

  test("still shows the page when the browser blocks storage", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new Error("blocked");
        },
      });
    });
    await page.goto("/");
    await expect(page.locator("#connect")).toBeVisible();
    await openSettings(page);
    await expect(page.locator("#language-picker option")).toHaveText(["繁體中文", "English"]);
  });
});

test.describe("REPL", () => {
  async function connected(page: Page, options: object = {}) {
    await mockSerial(page, options);
    await page.goto("/");
    await page.locator("#connect").click();
    await expect(page.locator("#upload")).toBeEnabled();
    await expect(page.locator("#monitor")).toContainText(">>> ");
  }
  const box = (page: Page) => page.locator("#repl-input");
  const commands = (page: Page) => page.evaluate(() => (globalThis as any).board.commands as string[]);
  const pasted = (page: Page) => page.evaluate(() => (globalThis as any).board.pasted as string[]);

  test("runs a command and shows the answer", async ({ page }) => {
    await connected(page);
    await box(page).fill("1+1");
    await box(page).press("Enter");
    await expect(page.locator("#monitor")).toContainText("1+1\r\n2\r\n>>> ".replace(/\r/g, ""));
    await expect(box(page)).toHaveValue("");
    expect(await commands(page)).toEqual(["1+1"]);
  });

  test("the send button works too", async ({ page }) => {
    await connected(page);
    await box(page).fill("print(1)");
    await page.locator("#repl-send").click();
    await expect.poll(() => commands(page)).toEqual(["print(1)"]);
  });

  test("brings back earlier commands and the unsent text", async ({ page }) => {
    await connected(page);
    for (const command of ["first", "second"]) {
      await box(page).fill(command);
      await box(page).press("Enter");
    }
    await box(page).fill("draft");
    await box(page).press("ArrowUp");
    await expect(box(page)).toHaveValue("second");
    await box(page).press("ArrowUp");
    await expect(box(page)).toHaveValue("first");
    await box(page).press("ArrowDown");
    await expect(box(page)).toHaveValue("second");
    await box(page).press("ArrowDown");
    await expect(box(page)).toHaveValue("draft");
  });

  test("never stores earlier commands, which may hold a password", async ({ page }) => {
    await connected(page);
    await box(page).fill('wlan.connect("home", "my-secret")');
    await box(page).press("Enter");
    await expect.poll(() => commands(page)).toHaveLength(1);
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain("my-secret");
  });

  test("Tab completes a name without touching the monitor or leaving text on the board", async ({ page }) => {
    await connected(page);
    const before = await page.locator("#monitor").textContent();
    await box(page).fill("impor");
    await box(page).press("Tab");
    await expect(box(page)).toHaveValue("import ");
    await expect(box(page)).toBeFocused();
    expect(await page.locator("#monitor").textContent()).toBe(before);
    await expect.poll(() => page.evaluate(() => (globalThis as any).board.line)).toBe("");
    await box(page).pressSequentially("sys");
    await box(page).press("Enter");
    await expect.poll(() => commands(page)).toEqual(["import sys"]);
  });

  test("Tab lists the choices above the box until the text changes", async ({ page }) => {
    await connected(page);
    await box(page).fill("sys.std");
    await box(page).press("Tab");
    await expect(page.locator("#repl-choices")).toHaveText("stderr  stdin  stdout");
    await expect(box(page)).toHaveValue("sys.std");
    await box(page).pressSequentially("o");
    await expect(page.locator("#repl-choices")).toBeHidden();
  });

  test("Tab leaves a running program alone and still moves the focus", async ({ page }) => {
    await connected(page);
    await page.locator("#upload").click();
    await expect(page.locator("#ip-link")).toBeVisible();
    await expect(box(page)).toHaveAttribute("placeholder", /按「停止」/);
    const sent = await page.evaluate(() => (globalThis as any).board.received.length);
    await box(page).fill("impor");
    await box(page).press("Tab");
    await expect(box(page)).not.toBeFocused();
    expect(await page.evaluate(() => (globalThis as any).board.received.length)).toBe(sent);
  });

  test("an empty box leaves Tab for moving between controls", async ({ page }) => {
    await connected(page);
    await box(page).focus();
    await page.keyboard.press("Tab");
    await expect(box(page)).not.toBeFocused();
  });

  test("writes a block over several lines and runs it whole", async ({ page }) => {
    await connected(page);
    await box(page).focus();
    await page.keyboard.type("for i in range(3):");
    await page.keyboard.press("Enter");
    await expect(box(page)).toHaveValue("for i in range(3):\n    ");
    await expect(box(page)).toHaveAttribute("rows", "2");
    await page.keyboard.type("print(i)");
    await page.keyboard.press("Enter");
    await expect(box(page)).toHaveValue("for i in range(3):\n    print(i)\n    ");
    expect(await pasted(page)).toEqual([]);
    await page.keyboard.press("Enter");
    await expect.poll(() => pasted(page)).toEqual(["for i in range(3):\r    print(i)\r"]);
    await expect(page.locator("#monitor")).toContainText("ran block");
    await expect(box(page)).toHaveValue("");
    await expect(box(page)).toHaveAttribute("rows", "1");

    await box(page).press("ArrowUp");
    await expect(box(page)).toHaveValue("for i in range(3):\n    print(i)");
  });

  test("Shift+Enter adds a line and Ctrl+Enter sends at once", async ({ page }) => {
    await connected(page);
    await box(page).fill("a = 1");
    await box(page).press("Shift+Enter");
    await page.keyboard.type("b = 2");
    await expect(box(page)).toHaveValue("a = 1\nb = 2");
    await box(page).press("Control+Enter");
    await expect.poll(() => pasted(page)).toEqual(["a = 1\rb = 2\r"]);
  });

  test("pasted lines are sent whole, and Enter inside them only adds a line", async ({ page }) => {
    await connected(page);
    await box(page).fill("x = 1\ny = 2");
    await box(page).evaluate((node) => (node as HTMLTextAreaElement).setSelectionRange(3, 3));
    await box(page).press("Enter");
    expect(await pasted(page)).toEqual([]);
    await expect(box(page)).toHaveValue("x =\n 1\ny = 2");
    await page.locator("#repl-send").click();
    await expect.poll(() => pasted(page)).toHaveLength(1);
  });

  test("keeps a block while a program runs instead of feeding it to the program", async ({ page }) => {
    await connected(page);
    await page.locator("#upload").click();
    await expect(page.locator("#ip-link")).toBeVisible();
    await box(page).fill("a = 1\nb = 2");
    await page.locator("#repl-send").click();
    await expect(page.locator("#monitor")).toContainText("程式還在執行");
    await expect(box(page)).toHaveValue("a = 1\nb = 2");
    expect(await pasted(page)).toEqual([]);

    await page.locator("#stop").click();
    await expect(box(page)).toHaveAttribute("placeholder", /輸入 MicroPython/);
    await page.locator("#repl-send").click();
    await expect.poll(() => pasted(page)).toHaveLength(1);
  });

  test("a one-line command still reaches a program waiting for input", async ({ page }) => {
    await connected(page);
    await page.locator("#upload").click();
    await expect(page.locator("#ip-link")).toBeVisible();
    await box(page).fill("yes");
    await box(page).press("Enter");
    await expect.poll(() => commands(page)).toContain("yes");
  });

  test("Ctrl+C interrupts, unless text is selected for copying", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await connected(page);
    const interrupts = () => page.evaluate(() => (globalThis as any).board.received.filter((byte: number) => byte === 3).length);
    const before = await interrupts();
    await box(page).fill("copy me");
    await box(page).evaluate((node) => (node as HTMLTextAreaElement).select());
    await box(page).press("Control+c");
    expect(await interrupts()).toBe(before);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("copy me");

    await box(page).evaluate((node) => (node as HTMLTextAreaElement).setSelectionRange(7, 7));
    await box(page).press("Control+c");
    await expect.poll(interrupts).toBeGreaterThan(before);
    await expect(box(page)).toHaveValue("");
    await expect(page.locator("#status")).toContainText("程式已停止");
  });

  test("clearing the monitor does not lose track of the prompt", async ({ page }) => {
    await connected(page);
    await page.locator("#clear").click();
    await box(page).fill("impor");
    await box(page).press("Tab");
    await expect(box(page)).toHaveValue("import ");
  });

  test("opens the tutorial from below the box", async ({ page, context }) => {
    await page.goto("/");
    const [help] = await Promise.all([context.waitForEvent("page"), page.locator("#repl-help").click()]);
    await help.waitForLoadState();
    await expect(help).toHaveURL(/help\.html#repl$/);
    await expect(help.locator("#repl h2")).toContainText("REPL");
    await expect(help.locator("#repl h2")).toBeInViewport();
  });

  test("the input keeps the code font size and fits a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.locator(".repl-tip")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  });

  test.describe("in an English browser", () => {
    test.use({ locale: "en-US" });

    test("guides students in English", async ({ page }) => {
      await connected(page);
      await expect(page.locator(".repl-tip")).toContainText("Tab completes");
      await page.locator("#upload").click();
      await expect(page.locator("#ip-link")).toBeVisible();
      await expect(box(page)).toHaveAttribute("placeholder", 'Program running. Press "Stop" to type commands');
      await box(page).fill("a = 1\nb = 2");
      await page.locator("#repl-send").click();
      await expect(page.locator("#monitor")).toContainText("The program is still running");
    });

    test("opens the English tutorial", async ({ page, context }) => {
      await page.goto("/");
      const [help] = await Promise.all([context.waitForEvent("page"), page.locator("#repl-help").click()]);
      await expect(help).toHaveURL(/help\.en\.html#repl$/);
      await expect(help.locator("#repl h2")).toContainText("REPL");
    await expect(help.locator("#repl h2")).toBeInViewport();
    });
  });
});

test.describe("edition name", () => {
  test("names the MicroPython edition in the title and heading", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/ESP32 Lab MicroPython 版/);
    await expect(page.locator(".topbar h1 .edition")).toHaveText("MicroPython 版");
    await page.goto("/help.html");
    await expect(page).toHaveTitle(/ESP32 Lab MicroPython 版/);
    await expect(page.locator("h1 .edition")).toHaveText("MicroPython 版");
  });

  test("shows the version from package.json on the editor and both help pages", async ({ page }) => {
    const { version } = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
    const shown = `v${version.replace(/\.0$/, "")}`;
    for (const path of ["/", "/help.html", "/help.en.html"]) {
      await page.goto(path);
      await expect(page.locator("h1 .version"), path).toHaveText(shown);
    }
  });

  test.describe("in an English browser", () => {
    test.use({ locale: "en-US" });

    test("uses the English name", async ({ page }) => {
      await page.goto("/");
      await expect(page).toHaveTitle(/ESP32 Lab MicroPython Edition/);
      await expect(page.locator(".topbar h1 .edition")).toHaveText("MicroPython Edition");
      await page.goto("/help.html");
      await expect(page).toHaveURL(/help.en.html/);
      await expect(page).toHaveTitle(/ESP32 Lab MicroPython Edition/);
    });
  });
});

test.describe("example numbers", () => {
  for (const [locale, heading] of [["zh-TW", "範例"], ["en-US", "Example"]] as const) {
    test.describe(locale, () => {
      test.use({ locale });

      test("the menu number matches the number written in each example", async ({ page }) => {
        page.on("dialog", (dialog) => void dialog.accept());
        await page.goto("/");
        const options = await page.locator("#examples optgroup option").evaluateAll((items) => items.map((item) => (item as HTMLOptionElement).value));
        expect(options).toHaveLength(20);
        for (const [index, value] of options.entries()) {
          const label = await page.locator(`#examples option[value="${value}"]`).textContent();
          expect(label!.startsWith(`${index + 1}. `)).toBe(true);
          await page.locator("#examples").selectOption(value);
          await expect(page.locator("#editor .cm-line").first()).toContainText(`${heading} ${index + 1}`);
        }
      });
    });
  }
});
