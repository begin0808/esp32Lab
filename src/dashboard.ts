import {
  dashTopic,
  DIRECTIONS,
  fitNumber,
  formatClock,
  formatInfo,
  formatNumber,
  formatVector,
  gaugeFraction,
  logCsv,
  MAX_COLUMNS,
  MAX_INPUT,
  parseColor,
  parseInfo,
  parseLayout,
  parseNumber,
  parseRows,
  stickVector,
  tiltVector,
  type BoardInfo,
  type Widget,
} from "./dash";
import { setupLanguagePicker, t, translatePage } from "./i18n";
import { el, setStatus, setupMqttPage } from "./mqttpage";
import { setupHomeLinks } from "./nav";
import { csvFileName } from "./plot";
import { setupStats } from "./stats";
import { setupStylePicker } from "./theme";

translatePage();

const BOARD_REPLY_TIMEOUT = 5000;
const CHART_POINTS = 60;
/** The phone keeps the newest 200 rows of each log. */
const LOG_ROWS = 200;
const NUMBER_WAIT_MS = 1500;
const STICK_SEND_MS = 150;
const STICK_REPEAT_MS = 400;
const TILT_SEND_MS = 200;
const TILT_CHECK_MS = 2000;
const SVG = "http://www.w3.org/2000/svg";

const ui = {
  boardStatus: el("board-status"),
  boardInfo: el("board-info"),
  widgets: el("widgets"),
  empty: el("empty"),
};

interface View {
  update(payload: string): void;
  setEnabled(enabled: boolean): void;
}

let channel = "";
let boardOnline = false;
let layoutText = "";
let replyTimer: ReturnType<typeof setTimeout> | undefined;
/** The newest value of each widget, kept even before the layout arrives, because the broker sends them in any order. */
const values = new Map<string, string>();
/** Chart values with the time each one arrived, because the board sends no times of its own. */
const history = new Map<string, { value: number; time: number }[]>();
/** Log rows with the time each one arrived, kept apart from the layout so a new layout does not lose them. */
const logs = new Map<string, { time: number; cells: string[] }[]>();
let info: BoardInfo | null = null;
let views = new Map<string, View>();

function svg<K extends keyof SVGElementTagNameMap>(name: K, attributes: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

function part<K extends keyof HTMLElementTagNameMap>(name: K, className: string, text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(name);
  node.className = className;
  node.textContent = text;
  return node;
}

function send(widget: Widget, payload: string, retain: boolean): void {
  page.publish(dashTopic(channel, `in/${widget.id}`), payload, retain);
}

function numberView(card: HTMLElement, widget: Widget): View {
  const line = part("p", "value-line");
  const number = part("span", "number", "—");
  line.append(number, part("span", "unit", widget.unit));
  card.append(line);
  return {
    update(payload) {
      const value = parseNumber(payload);
      number.textContent = value === null ? payload || "—" : formatNumber(value);
    },
    setEnabled() {},
  };
}

function gaugeView(card: HTMLElement, widget: Widget): View {
  // pathLength lets the arc be filled by a percentage, whatever its real length.
  const arc = "M 10 60 A 50 50 0 0 1 110 60";
  const drawing = svg("svg", { viewBox: "0 0 120 66", class: "gauge", "aria-hidden": "true" });
  drawing.append(svg("path", { d: arc, class: "gauge-track", pathLength: 100 }));
  const fill = svg("path", { d: arc, class: "gauge-fill", pathLength: 100, "stroke-dasharray": "0 100", "data-color": widget.color });
  drawing.append(fill);
  card.append(drawing);
  const number = numberView(card, widget);
  const range = part("p", "gauge-range");
  range.append(part("span", "", formatNumber(widget.min)), part("span", "", formatNumber(widget.max)));
  card.append(range);
  return {
    update(payload) {
      number.update(payload);
      const value = parseNumber(payload);
      const percent = value === null ? 0 : gaugeFraction(value, widget.min, widget.max) * 100;
      fill.setAttribute("stroke-dasharray", `${percent} 100`);
    },
    setEnabled() {},
  };
}

function chartView(card: HTMLElement, widget: Widget): View {
  const number = numberView(card, widget);
  const drawing = svg("svg", { viewBox: "0 0 300 100", preserveAspectRatio: "none", class: "chart", "aria-hidden": "true" });
  const line = svg("polyline", { class: "chart-line", points: "" });
  // The newest value is marked, so even a single value shows on the chart.
  const dot = svg("path", { class: "chart-dot", d: "" });
  drawing.append(line, dot);
  // The oldest, middle and newest times, so students can tell how fast the values change.
  const times = part("p", "chart-times");
  const range = part("p", "chart-range");
  card.append(drawing, times, range);
  const draw = () => {
    const entries = history.get(widget.id) ?? [];
    const points = entries.map((entry) => entry.value);
    if (points.length === 0) {
      line.setAttribute("points", "");
      dot.setAttribute("d", "");
      times.replaceChildren();
      range.textContent = "";
      return;
    }
    // The time across runs from the oldest value at the left to the newest at the right, so the times below
    // match the line, and a pause in the data shows as a gap instead of being hidden.
    const first = entries[0].time;
    const last = entries.at(-1)!.time;
    const shown = last > first ? [first, (first + last) / 2, last] : [last];
    times.replaceChildren(...shown.map((time) => part("span", "", formatClock(new Date(time)))));
    const low = Math.min(...points);
    const high = Math.max(...points);
    const span = high - low || 1;
    // A margin on both sides keeps the round dot at the newest value inside the chart.
    const place = ({ value, time }: { value: number; time: number }) => [
      last > first ? 6 + ((time - first) / (last - first)) * 288 : 294,
      high === low ? 50 : 95 - ((value - low) / span) * 90,
    ];
    line.setAttribute("points", entries.map((entry) => place(entry).map((number) => number.toFixed(1)).join(",")).join(" "));
    const [x, y] = place(entries.at(-1)!);
    // A line with no length and round ends stays a round dot, however the chart is stretched.
    dot.setAttribute("d", `M ${x.toFixed(1)} ${y.toFixed(1)} h 0`);
    range.textContent = t("最低 {low}，最高 {high}", { low: formatNumber(low), high: formatNumber(high) });
  };
  draw();
  return {
    update(payload) {
      number.update(payload);
      draw();
    },
    setEnabled() {},
  };
}

function ledView(card: HTMLElement, widget: Widget): View {
  const line = part("p", "lamp-line");
  const lamp = part("span", "lamp");
  lamp.dataset.color = widget.color;
  const state = part("span", "lamp-state");
  line.append(lamp, state);
  card.append(line);
  return {
    update(payload) {
      const on = payload === "1";
      lamp.dataset.on = String(on);
      state.textContent = payload === "" ? "—" : on ? t("亮") : t("暗");
    },
    setEnabled() {},
  };
}

function textView(card: HTMLElement): View {
  const line = part("p", "widget-text", "—");
  card.append(line);
  return {
    update(payload) {
      line.textContent = payload || "—";
    },
    setEnabled() {},
  };
}

function switchView(card: HTMLElement, widget: Widget): View {
  const toggle = part("button", "toggle");
  toggle.type = "button";
  toggle.setAttribute("role", "switch");
  toggle.setAttribute("aria-checked", "false");
  toggle.setAttribute("aria-label", widget.label);
  const state = part("span", "toggle-state", t("關"));
  toggle.append(part("span", "toggle-knob"), state);
  card.append(toggle);
  toggle.addEventListener("click", () => {
    const next = toggle.getAttribute("aria-checked") !== "true";
    // The switch moves only when the board reports back, so it always shows what the board really did.
    toggle.dataset.waiting = "true";
    send(widget, next ? "1" : "0", true);
  });
  return {
    update(payload) {
      const on = payload === "1";
      toggle.setAttribute("aria-checked", String(on));
      state.textContent = on ? t("開") : t("關");
      delete toggle.dataset.waiting;
    },
    setEnabled(enabled) {
      toggle.disabled = !enabled;
    },
  };
}

function buttonView(card: HTMLElement, widget: Widget): View {
  const button = part("button", "btn big press", widget.label);
  button.type = "button";
  card.append(button);
  // A press is an event, not a state, so the broker must not replay it to the board later.
  button.addEventListener("click", () => send(widget, "1", false));
  return {
    update() {},
    setEnabled(enabled) {
      button.disabled = !enabled;
    },
  };
}

function sliderView(card: HTMLElement, widget: Widget): View {
  const number = numberView(card, widget);
  const input = part("input", "slider");
  input.type = "range";
  input.min = String(widget.min);
  input.max = String(widget.max);
  input.step = "1";
  input.value = String(widget.min);
  input.setAttribute("aria-label", widget.label);
  card.append(input);
  let dragging = false;
  input.addEventListener("input", () => {
    dragging = true;
    number.update(input.value);
  });
  // Only the final position is sent, so dragging does not flood the broker.
  input.addEventListener("change", () => {
    dragging = false;
    send(widget, input.value, true);
  });
  return {
    update(payload) {
      if (dragging) return;
      number.update(payload);
      const value = parseNumber(payload);
      if (value !== null) input.value = String(value);
    },
    setEnabled(enabled) {
      input.disabled = !enabled;
    },
  };
}

function colorView(card: HTMLElement, widget: Widget): View {
  const line = part("p", "color-line");
  const input = part("input", "color-input");
  input.type = "color";
  input.value = "#ffffff";
  input.setAttribute("aria-label", widget.label);
  const code = part("span", "color-code", "#ffffff");
  line.append(input, code);
  card.append(line);
  input.addEventListener("input", () => {
    code.textContent = input.value;
  });
  // The picker sends once it closes, so trying colours does not flood the broker.
  input.addEventListener("change", () => send(widget, input.value, true));
  return {
    update(payload) {
      const color = parseColor(payload);
      if (!color) return;
      input.value = color;
      code.textContent = color;
    },
    setEnabled(enabled) {
      input.disabled = !enabled;
    },
  };
}

const PAD_REPEAT_MS = 400;
const ARROWS: Record<(typeof DIRECTIONS)[number], string> = { up: "▲", down: "▼", left: "◀", right: "▶" };

function padView(card: HTMLElement, widget: Widget): View {
  const names = { up: t("上"), down: t("下"), left: t("左"), right: t("右") };
  const grid = part("div", "pad");
  const state = part("p", "pad-state", t("放開：停止"));
  const buttons: HTMLButtonElement[] = [];
  let held: string | null = null;
  let repeat: ReturnType<typeof setInterval> | undefined;
  // While a key is held the direction is sent again and again. The board stops by itself when the
  // messages stop, so a phone that drops off or a finger that slides away can never leave a car running.
  const start = (direction: string) => {
    if (held === direction) return;
    stop(false);
    held = direction;
    state.textContent = t("按住：{direction}", { direction: names[direction as keyof typeof names] });
    send(widget, direction, false);
    repeat = setInterval(() => send(widget, direction, false), PAD_REPEAT_MS);
  };
  const stop = (tell = true) => {
    clearInterval(repeat);
    if (held === null) return;
    held = null;
    state.textContent = t("放開：停止");
    if (tell) send(widget, "", false);
  };
  for (const direction of DIRECTIONS) {
    const button = part("button", `pad-key pad-${direction}`, ARROWS[direction]);
    button.type = "button";
    button.setAttribute("aria-label", names[direction]);
    button.addEventListener("pointerdown", (event) => {
      // Capturing keeps the key held while the finger slides a little; a browser that refuses still drives the car.
      try {
        button.setPointerCapture(event.pointerId);
      } catch {
        // Released by pointerup instead.
      }
      start(direction);
    });
    for (const name of ["pointerup", "pointercancel", "lostpointercapture"] as const) button.addEventListener(name, () => stop());
    button.addEventListener("keydown", (event) => {
      if ((event.key === "Enter" || event.key === " ") && !event.repeat) {
        event.preventDefault();
        start(direction);
      }
    });
    button.addEventListener("keyup", (event) => {
      if (event.key === "Enter" || event.key === " ") stop();
    });
    // Pressing another key moves the focus there, and the key it left must not stop the new direction.
    button.addEventListener("blur", () => {
      if (held === direction) stop();
    });
    // A long press must not open the phone's text menu.
    button.addEventListener("contextmenu", (event) => event.preventDefault());
    buttons.push(button);
  }
  grid.append(...buttons);
  card.append(grid, state);
  window.addEventListener("blur", () => stop());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
  });
  return {
    update() {},
    setEnabled(enabled) {
      if (!enabled) stop(false);
      for (const button of buttons) button.disabled = !enabled;
    },
  };
}

function selectView(card: HTMLElement, widget: Widget): View {
  const group = part("div", "choices");
  group.setAttribute("role", "radiogroup");
  group.setAttribute("aria-label", widget.label);
  const buttons = widget.options.map((option) => {
    const button = part("button", "choice", option);
    button.type = "button";
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", "false");
    button.addEventListener("click", () => {
      // The choice is marked once the board reports back, like a switch.
      button.dataset.waiting = "true";
      send(widget, option, true);
    });
    return button;
  });
  group.append(...buttons);
  card.append(group);
  return {
    update(payload) {
      for (const button of buttons) {
        button.setAttribute("aria-checked", String(button.textContent === payload));
        delete button.dataset.waiting;
      }
    },
    setEnabled(enabled) {
      for (const button of buttons) button.disabled = !enabled;
    },
  };
}

function inputView(card: HTMLElement, widget: Widget): View {
  const form = part("form", "input-form");
  const field = part("input", "text-input");
  field.type = "text";
  field.maxLength = MAX_INPUT;
  field.placeholder = t("輸入文字");
  field.setAttribute("aria-label", widget.label);
  field.autocomplete = "off";
  const button = part("button", "btn", t("送出"));
  const got = part("p", "input-got");
  form.append(field, button);
  card.append(form, got);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!field.value) return;
    send(widget, field.value, true);
    field.value = "";
  });
  return {
    update(payload) {
      got.textContent = payload ? t("板子收到：{text}", { text: payload }) : "";
    },
    setEnabled(enabled) {
      field.disabled = !enabled;
      button.disabled = !enabled;
    },
  };
}

function numberSettingView(card: HTMLElement, widget: Widget): View {
  const number = numberView(card, widget);
  const form = part("form", "number-form");
  // The value is fitted into range and onto a step below, instead of the browser refusing it with a bubble phones show badly.
  form.noValidate = true;
  const minus = part("button", "btn number-step", "−");
  minus.type = "button";
  minus.setAttribute("aria-label", t("減少"));
  const field = part("input", "number-input");
  field.type = "number";
  field.inputMode = "decimal";
  field.min = String(widget.min);
  field.max = String(widget.max);
  field.step = String(widget.step);
  field.setAttribute("aria-label", widget.label);
  const plus = part("button", "btn number-step", "+");
  plus.type = "button";
  plus.setAttribute("aria-label", t("增加"));
  const apply = part("button", "btn", t("設定"));
  form.append(minus, field, plus, apply);
  const range = part("p", "number-range", t("範圍 {min}～{max}，每次 {step}", { min: formatNumber(widget.min), max: formatNumber(widget.max), step: formatNumber(widget.step) }));
  card.append(form, range);
  let current = widget.min;
  // While the board has not answered a tap yet, its older echo must not undo the next tap.
  let waitUntil = 0;
  const submit = (value: number) => {
    current = fitNumber(value, widget.min, widget.max, widget.step);
    field.value = formatNumber(current);
    waitUntil = Date.now() + NUMBER_WAIT_MS;
    send(widget, formatNumber(current), true);
  };
  minus.addEventListener("click", () => submit(current - widget.step));
  plus.addEventListener("click", () => submit(current + widget.step));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = parseNumber(field.value);
    if (value !== null) submit(value);
  });
  const controls = [minus, field, plus, apply];
  return {
    update(payload) {
      number.update(payload);
      const value = parseNumber(payload);
      if (value === null || Date.now() < waitUntil) return;
      current = value;
      if (document.activeElement !== field) field.value = formatNumber(value);
    },
    setEnabled(enabled) {
      for (const control of controls) control.disabled = !enabled;
    },
  };
}

function logView(card: HTMLElement, widget: Widget): View {
  const tools = part("div", "log-tools");
  const count = part("p", "log-count");
  const download = part("button", "btn small", t("下載 CSV"));
  download.type = "button";
  const clear = part("button", "btn small", t("清除"));
  clear.type = "button";
  tools.append(count, download, clear);
  const wrap = part("div", "log-wrap");
  const table = part("table", "log-table");
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const name of [t("時間"), ...widget.options]) headRow.append(part("th", "", name));
  head.append(headRow);
  const body = document.createElement("tbody");
  table.append(head, body);
  wrap.append(table);
  const note = part("p", "log-note", t("紀錄只存在這個頁面，重新整理或關掉就會清空，請記得先下載。"));
  card.append(tools, wrap, note);
  const rows = () => logs.get(widget.id) ?? [];
  const draw = () => {
    const list = rows();
    count.textContent = list.length ? t("共 {count} 筆", { count: list.length }) : t("還沒有紀錄");
    download.disabled = clear.disabled = list.length === 0;
    // The newest row is on top, where it shows without scrolling.
    body.replaceChildren(
      ...list
        .slice()
        .reverse()
        .map((row) => {
          const line = document.createElement("tr");
          line.append(part("td", "", formatClock(new Date(row.time))), ...widget.options.map((_, index) => part("td", "", row.cells[index] ?? "")));
          return line;
        }),
    );
  };
  download.addEventListener("click", () => {
    const list = rows().map((row) => ({ time: row.time, cells: widget.options.map((_, index) => row.cells[index] ?? "") }));
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(new Blob([logCsv(widget.options, list)], { type: "text/csv;charset=utf-8" }));
    anchor.download = csvFileName(new Date(), "esp32-log");
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  });
  clear.addEventListener("click", () => {
    if (!confirm(t("要清除這個紀錄表嗎？還沒下載的資料會不見。"))) return;
    logs.delete(widget.id);
    draw();
  });
  draw();
  return { update: draw, setEnabled() {} };
}

/** The round area of a joystick or tilt, with a dot where it points and the numbers the board gets. */
function stickArea(card: HTMLElement, className: string): { area: HTMLElement; show(vector: string): void } {
  const area = part("div", `stick ${className}`);
  const dot = part("span", "stick-dot");
  area.append(dot);
  const readout = part("p", "stick-readout");
  card.append(area, readout);
  const show = (vector: string) => {
    const [x, y] = vector.split(",").map(Number);
    // The dot moves half the area's width at full tilt, so it stays inside the circle.
    dot.style.left = `${50 + x / 2}%`;
    dot.style.top = `${50 - y / 2}%`;
    readout.textContent = t("左右 {x}，前後 {y}", { x, y });
  };
  show("0,0");
  return { area, show };
}

function joystickView(card: HTMLElement, widget: Widget): View {
  const { area, show } = stickArea(card, "joystick");
  area.tabIndex = 0;
  area.setAttribute("role", "slider");
  area.setAttribute("aria-label", t("{label}：拖動圓點，或按方向鍵", { label: widget.label }));
  let held = false;
  let enabled = false;
  let latest = "0,0";
  let sent = "";
  let sentAt = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  const keys = new Set<string>();
  // A changed position goes out at most every 0.15 s, and the same one again every 0.4 s, so the board
  // knows the finger is still down. When the messages stop, the board centres the joystick by itself.
  const tick = () => {
    const now = Date.now();
    if (latest !== sent || now - sentAt >= STICK_REPEAT_MS) {
      send(widget, latest, false);
      sent = latest;
      sentAt = now;
    }
  };
  const hold = () => {
    if (held || !enabled) return;
    held = true;
    sent = "";
    timer = setInterval(tick, STICK_SEND_MS);
  };
  const move = (vector: string) => {
    latest = vector;
    show(vector);
    if (Date.now() - sentAt >= STICK_SEND_MS) tick();
  };
  const release = (tell = true) => {
    clearInterval(timer);
    keys.clear();
    latest = "0,0";
    show(latest);
    if (!held) return;
    held = false;
    if (tell) send(widget, "", false);
  };
  const follow = (event: PointerEvent) => {
    const box = area.getBoundingClientRect();
    move(stickVector(event.clientX - (box.left + box.width / 2), event.clientY - (box.top + box.height / 2), box.width / 2));
  };
  area.addEventListener("pointerdown", (event) => {
    if (!enabled) return;
    try {
      area.setPointerCapture(event.pointerId);
    } catch {
      // Released by pointerup instead.
    }
    hold();
    follow(event);
  });
  area.addEventListener("pointermove", (event) => {
    if (held && keys.size === 0) follow(event);
  });
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"] as const) area.addEventListener(name, () => release());
  const arrows: Record<string, [number, number]> = { ArrowUp: [0, 100], ArrowDown: [0, -100], ArrowLeft: [-100, 0], ArrowRight: [100, 0] };
  const fromKeys = () => {
    let x = 0;
    let y = 0;
    for (const key of keys) {
      x += arrows[key][0];
      y += arrows[key][1];
    }
    return formatVector(x, y);
  };
  area.addEventListener("keydown", (event) => {
    if (!(event.key in arrows) || !enabled) return;
    event.preventDefault();
    if (event.repeat) return;
    keys.add(event.key);
    hold();
    move(fromKeys());
  });
  area.addEventListener("keyup", (event) => {
    if (!keys.delete(event.key)) return;
    if (keys.size === 0) release();
    else move(fromKeys());
  });
  area.addEventListener("blur", () => release());
  area.addEventListener("contextmenu", (event) => event.preventDefault());
  window.addEventListener("blur", () => release());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) release();
  });
  return {
    update() {},
    setEnabled(value) {
      enabled = value;
      if (!value) release(false);
      area.dataset.disabled = String(!value);
    },
  };
}

/** Safari asks for permission before a page may read the motion sensors; other browsers have no such step. */
type OrientationWithPermission = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> };

function tiltView(card: HTMLElement, widget: Widget): View {
  const toggle = part("button", "btn tilt-toggle", t("開始傾斜控制"));
  toggle.type = "button";
  toggle.setAttribute("aria-pressed", "false");
  card.append(toggle);
  const { show } = stickArea(card, "tilt");
  const note = part("p", "tilt-note", t("手機平放是 0。往前傾是前進，往右傾是右轉，傾斜 45 度就是最大。"));
  card.append(note);
  let on = false;
  let latest: string | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;
  let check: ReturnType<typeof setTimeout> | undefined;
  const read = (event: DeviceOrientationEvent) => {
    if (event.beta === null || event.gamma === null) return;
    latest = tiltVector(event.beta, event.gamma);
    show(latest);
  };
  const stop = (tell = true, message = "") => {
    clearInterval(timer);
    clearTimeout(check);
    window.removeEventListener("deviceorientation", read);
    show("0,0");
    toggle.textContent = t("開始傾斜控制");
    toggle.setAttribute("aria-pressed", "false");
    if (message) note.textContent = message;
    if (!on) return;
    on = false;
    if (tell) send(widget, "", false);
  };
  const start = async () => {
    if (!window.isSecureContext) {
      note.textContent = t("要用 https 開頭的網址打開這一頁，手機才會提供傾斜感測器。");
      return;
    }
    if (typeof DeviceOrientationEvent === "undefined") {
      note.textContent = t("這個瀏覽器讀不到傾斜感測器，請改用手機的 Chrome 或 Safari。");
      return;
    }
    const sensor = DeviceOrientationEvent as OrientationWithPermission;
    if (sensor.requestPermission) {
      try {
        if ((await sensor.requestPermission()) !== "granted") throw new Error("denied");
      } catch {
        note.textContent = t("沒有允許讀取動作感測器。請關掉這一頁再打開，按「開始傾斜控制」時選「允許」。");
        return;
      }
    }
    on = true;
    latest = null;
    toggle.textContent = t("停止傾斜控制");
    toggle.setAttribute("aria-pressed", "true");
    note.textContent = t("手機平放是 0。往前傾是前進，往右傾是右轉，傾斜 45 度就是最大。");
    window.addEventListener("deviceorientation", read);
    // The position goes out every 0.2 s even when it stays the same, so the board knows tilt is still on.
    timer = setInterval(() => {
      if (latest) send(widget, latest, false);
    }, TILT_SEND_MS);
    check = setTimeout(() => {
      if (latest === null) stop(true, t("沒有收到傾斜資料，這個裝置可能沒有傾斜感測器（電腦通常沒有）。"));
    }, TILT_CHECK_MS);
  };
  toggle.addEventListener("click", () => {
    if (on) stop();
    else void start();
  });
  window.addEventListener("blur", () => stop());
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
  });
  return {
    update() {},
    setEnabled(enabled) {
      if (!enabled) stop(false);
      toggle.disabled = !enabled;
    },
  };
}

/** Browsers only let a page make sounds after it was tapped, so the alert card has a button to allow them. */
let audio: AudioContext | null = null;

function beep(): void {
  if (!audio) return;
  const now = audio.currentTime;
  for (const [offset, pitch] of [[0, 880], [0.25, 660]]) {
    const tone = audio.createOscillator();
    const volume = audio.createGain();
    tone.frequency.value = pitch;
    volume.gain.setValueAtTime(0.25, now + offset);
    volume.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.22);
    tone.connect(volume).connect(audio.destination);
    tone.start(now + offset);
    tone.stop(now + offset + 0.23);
  }
}

function alertView(card: HTMLElement): View {
  const message = part("p", "alert-message", t("還沒有提醒"));
  const time = part("p", "alert-time");
  const sound = part("button", "btn small alert-sound", t("開啟提醒聲音"));
  sound.type = "button";
  sound.addEventListener("click", () => {
    audio ??= new AudioContext();
    void audio.resume();
    sound.textContent = t("提醒聲音已開啟");
    sound.disabled = true;
    beep();
  });
  card.append(message, time, sound);
  card.setAttribute("role", "alert");
  let calm: ReturnType<typeof setTimeout> | undefined;
  return {
    update(payload) {
      if (!payload) return;
      message.textContent = payload;
      time.textContent = formatClock(new Date());
      card.dataset.ringing = "true";
      clearTimeout(calm);
      calm = setTimeout(() => delete card.dataset.ringing, 4000);
      beep();
      navigator.vibrate?.([200, 100, 200]);
    },
    setEnabled() {},
  };
}

function buildView(widget: Widget): { card: HTMLElement; view: View } {
  const card = part("section", `widget widget-${widget.kind}`);
  if (widget.kind !== "button") card.append(part("h2", "widget-label", widget.label));
  const builders: Record<Widget["kind"], () => View> = {
    value: () => numberView(card, widget),
    gauge: () => gaugeView(card, widget),
    chart: () => chartView(card, widget),
    led: () => ledView(card, widget),
    text: () => textView(card),
    alert: () => alertView(card),
    switch: () => switchView(card, widget),
    button: () => buttonView(card, widget),
    slider: () => sliderView(card, widget),
    color: () => colorView(card, widget),
    pad: () => padView(card, widget),
    select: () => selectView(card, widget),
    input: () => inputView(card, widget),
    number: () => numberSettingView(card, widget),
    log: () => logView(card, widget),
    tilt: () => tiltView(card, widget),
    joystick: () => joystickView(card, widget),
  };
  return { card, view: builders[widget.kind]() };
}

function showLayout(widgets: Widget[]): void {
  views = new Map();
  ui.widgets.replaceChildren();
  for (const widget of widgets) {
    const { card, view } = buildView(widget);
    ui.widgets.append(card);
    views.set(widget.id, view);
    view.update(values.get(widget.id) ?? "");
    view.setEnabled(boardOnline);
  }
  ui.empty.hidden = widgets.length > 0;
}

function onValue(id: string, payload: string): void {
  values.set(id, payload);
  if (id.endsWith("c")) {
    const value = parseNumber(payload);
    if (value !== null) {
      const points = history.get(id) ?? [];
      points.push({ value, time: Date.now() });
      if (points.length > CHART_POINTS) points.shift();
      history.set(id, points);
    }
  }
  views.get(id)?.update(payload);
}

function showInfo(): void {
  const text = info && boardOnline ? formatInfo(info) : "";
  ui.boardInfo.textContent = text;
  ui.boardInfo.hidden = !text;
}

function setBoardOnline(online: boolean): void {
  boardOnline = online;
  for (const view of views.values()) view.setEnabled(online);
  showInfo();
}

function onMessage(topic: string, payload: Uint8Array, retained: boolean): void {
  const name = topic.slice(dashTopic(channel, "").length);
  const text = new TextDecoder().decode(payload);
  if (name === "layout") {
    clearTimeout(replyTimer);
    const widgets = parseLayout(text);
    // The broker repeats the layout after every reconnect; rebuilding would lose a slider being dragged.
    if (widgets && text !== layoutText) {
      layoutText = text;
      showLayout(widgets);
    }
  } else if (name === "state") {
    clearTimeout(replyTimer);
    if (text === "online") {
      setStatus(ui.boardStatus, t("開發板：在線"), "ready");
      setBoardOnline(true);
    } else if (text === "offline") {
      setStatus(ui.boardStatus, t("開發板：離線，請確認程式正在執行"), "error");
      setBoardOnline(false);
    }
  } else if (name === "info") {
    info = parseInfo(text);
    showInfo();
  } else if (name.startsWith("out/")) {
    const id = name.slice(4);
    // Log rows are events too: each arrives once, gets the phone's time, and is added below the others.
    if (id.endsWith("o")) {
      const rows = retained ? null : parseRows(text, MAX_COLUMNS);
      if (!rows?.length) return;
      const list = logs.get(id) ?? [];
      const time = Date.now();
      list.push(...rows.map((cells) => ({ time, cells })));
      list.splice(0, Math.max(0, list.length - LOG_ROWS));
      logs.set(id, list);
      views.get(id)?.update(text);
      return;
    }
    // An alert is an event: it is shown once when it happens, never kept, and never replayed from the broker.
    if (id.endsWith("a")) {
      if (!retained) views.get(id)?.update(text);
      return;
    }
    onValue(id, text);
  }
}

const page = setupMqttPage({
  channelKey: "esp32-mp-dash-channel",
  describeTopics: (name) => t("實際使用的 Topic：{topic}（畫面、數值和操作都在這裡面）", { topic: dashTopic(name, "…") }),
  onConnecting(name) {
    clearTimeout(replyTimer);
    channel = name;
    layoutText = "";
    values.clear();
    history.clear();
    logs.clear();
    info = null;
    showLayout([]);
    setBoardOnline(false);
    setStatus(ui.boardStatus, t("開發板：尚未回報"), "idle");
  },
  onConnected(client, name) {
    client.subscribe([dashTopic(name, "layout"), dashTopic(name, "state"), dashTopic(name, "info"), dashTopic(name, "out/+")]);
    clearTimeout(replyTimer);
    replyTimer = setTimeout(() => {
      if (!layoutText) setStatus(ui.boardStatus, t("開發板：沒有回應，請確認主題名稱和程式是否正在執行"), "error");
    }, BOARD_REPLY_TIMEOUT);
  },
  onLost: () => setBoardOnline(false),
  onMessage,
});

setupStylePicker(el<HTMLSelectElement>("style-picker"));
// Reloading reconnects by itself unless the broker needs a password, which is not saved.
setupLanguagePicker(el<HTMLSelectElement>("language-picker"), { canFollow: () => !page.hasPassword() });
setupHomeLinks();
setupStats();
