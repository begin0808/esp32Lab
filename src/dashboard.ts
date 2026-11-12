import { dashTopic, formatClock, formatNumber, gaugeFraction, parseLayout, parseNumber, type Widget } from "./dash";
import { setupLanguagePicker, t, translatePage } from "./i18n";
import { el, setStatus, setupMqttPage } from "./mqttpage";
import { setupHomeLinks } from "./nav";
import { setupStats } from "./stats";
import { setupStylePicker } from "./theme";

translatePage();

const BOARD_REPLY_TIMEOUT = 5000;
const CHART_POINTS = 60;
const SVG = "http://www.w3.org/2000/svg";

const ui = {
  boardStatus: el("board-status"),
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
  const line = part("p", "widget-number");
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
    const shown = points.length >= 3 ? [entries[0], entries[Math.floor((entries.length - 1) / 2)], entries.at(-1)!] : [entries[0], entries.at(-1)!].slice(2 - points.length);
    times.replaceChildren(...shown.map((entry) => part("span", "", formatClock(new Date(entry.time)))));
    const low = Math.min(...points);
    const high = Math.max(...points);
    const span = high - low || 1;
    // A margin on both sides keeps the round dot at the newest value inside the chart.
    const step = 288 / (CHART_POINTS - 1);
    const start = CHART_POINTS - points.length;
    const place = (value: number, index: number) => [6 + (start + index) * step, high === low ? 50 : 95 - ((value - low) / span) * 90];
    line.setAttribute("points", points.map((value, index) => place(value, index).map((number) => number.toFixed(1)).join(",")).join(" "));
    const [x, y] = place(points.at(-1)!, points.length - 1);
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

function buildView(widget: Widget): { card: HTMLElement; view: View } {
  const card = part("section", `widget widget-${widget.kind}`);
  if (widget.kind !== "button") card.append(part("h2", "widget-label", widget.label));
  const builders: Record<Widget["kind"], () => View> = {
    value: () => numberView(card, widget),
    gauge: () => gaugeView(card, widget),
    chart: () => chartView(card, widget),
    led: () => ledView(card, widget),
    text: () => textView(card),
    switch: () => switchView(card, widget),
    button: () => buttonView(card, widget),
    slider: () => sliderView(card, widget),
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

function setBoardOnline(online: boolean): void {
  boardOnline = online;
  for (const view of views.values()) view.setEnabled(online);
}

function onMessage(topic: string, payload: Uint8Array): void {
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
  } else if (name.startsWith("out/")) {
    onValue(name.slice(4), text);
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
    showLayout([]);
    setBoardOnline(false);
    setStatus(ui.boardStatus, t("開發板：尚未回報"), "idle");
  },
  onConnected(client, name) {
    client.subscribe([dashTopic(name, "layout"), dashTopic(name, "state"), dashTopic(name, "out/+")]);
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
