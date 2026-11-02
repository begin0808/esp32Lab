import { t } from "./i18n";
import { csvFileName, MAX_ROWS, firstIndexFrom, formatValue, niceStep, type DataLog } from "./plot";

// Bright enough to read on the monitor's dark background in every style, and far enough apart to tell lines apart.
const COLORS = ["#ffd23f", "#5ec8ff", "#ff7a90", "#7ee081", "#c9a0ff", "#ffa94d", "#4fe0d0", "#f2f2f2"];
// About 30 pictures a second is smooth enough, and leaves time for the rest of the page.
const MIN_DRAW_GAP_MS = 33;
// Students often enlarge the font for a projector, but axis labels larger than this crowd out the lines.
const MAX_LABEL_PX = 24;

export interface PlotterElements {
  view: HTMLElement;
  canvas: HTMLCanvasElement;
  empty: HTMLElement;
  legend: HTMLElement;
  note: HTMLElement;
  pause: HTMLButtonElement;
  windowPicker: HTMLSelectElement;
  exportButton: HTMLButtonElement;
}

/** Draws the data log as a line chart. Drawing only happens while the chart is shown. */
export class Plotter {
  private readonly hiddenNames = new Set<string>();
  private paused = false;
  private frozenEnd = 0;
  private frame: number | null = null;
  private lastDraw = 0;
  private legendKey: string | null = null;
  private legendValues: HTMLElement[] = [];

  constructor(
    private readonly log: DataLog,
    private readonly ui: PlotterElements,
  ) {
    ui.pause.addEventListener("click", () => this.setPaused(!this.paused));
    ui.windowPicker.addEventListener("change", () => this.changed());
    ui.exportButton.addEventListener("click", () => this.exportCsv());
    new ResizeObserver(() => this.changed()).observe(ui.canvas);
  }

  get isShown(): boolean {
    return !this.ui.view.hidden;
  }

  show(): void {
    this.ui.view.hidden = false;
    this.changed();
  }

  hide(): void {
    this.ui.view.hidden = true;
  }

  /** Asks for a new picture. Many changes in a row are drawn once, on the next frame. */
  changed(): void {
    if (!this.isShown || this.frame !== null) return;
    this.frame = requestAnimationFrame(() => this.drawFrame());
  }

  /** Call after the log has been emptied. */
  cleared(): void {
    this.hiddenNames.clear();
    this.setPaused(false);
  }

  private setPaused(value: boolean): void {
    this.paused = value;
    this.frozenEnd = this.log.times.at(-1) ?? 0;
    this.ui.pause.textContent = value ? t("繼續") : t("暫停");
    this.ui.pause.setAttribute("aria-pressed", String(value));
    this.changed();
  }

  private exportCsv(): void {
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(new Blob([this.log.toCsv(t("時間（秒）"))], { type: "text/csv;charset=utf-8" }));
    anchor.download = csvFileName(new Date());
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  }

  private drawFrame(): void {
    this.frame = null;
    if (!this.isShown) return;
    const now = performance.now();
    if (now - this.lastDraw < MIN_DRAW_GAP_MS) {
      this.frame = requestAnimationFrame(() => this.drawFrame());
      return;
    }
    this.lastDraw = now;
    this.updateControls();
    this.updateLegend();
    this.draw();
  }

  private updateControls(): void {
    const empty = this.log.rowCount === 0;
    this.ui.empty.hidden = !empty;
    this.ui.exportButton.disabled = empty;
    const notes: string[] = [];
    if (this.paused) notes.push(t("畫面已暫停，資料仍在背景記錄"));
    if (this.log.dropped > 0) notes.push(t("只保留最近 {count} 筆，較早的資料已捨棄", { count: MAX_ROWS.toLocaleString() }));
    const note = notes.join("　");
    if (this.ui.note.textContent !== note) this.ui.note.textContent = note;
    this.ui.note.hidden = !note;
  }

  private updateLegend(): void {
    const key = this.log.series.map((series) => series.name).join("\n");
    if (key !== this.legendKey) {
      this.legendKey = key;
      this.legendValues = [];
      this.ui.legend.replaceChildren(
        ...this.log.series.map((series, index) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "plot-key";
          button.title = t("點一下隱藏或顯示這條線");
          button.setAttribute("aria-pressed", String(!this.hiddenNames.has(series.name)));
          const swatch = document.createElement("span");
          swatch.className = "plot-swatch";
          swatch.style.background = COLORS[index % COLORS.length];
          const name = document.createElement("span");
          name.textContent = series.name;
          const value = document.createElement("span");
          value.className = "plot-value";
          this.legendValues.push(value);
          button.append(swatch, name, value);
          button.addEventListener("click", () => {
            if (!this.hiddenNames.delete(series.name)) this.hiddenNames.add(series.name);
            button.setAttribute("aria-pressed", String(!this.hiddenNames.has(series.name)));
            this.changed();
          });
          return button;
        }),
      );
    }
    this.log.series.forEach((series, index) => {
      const latest = this.log.latest(series);
      const text = latest === undefined ? "" : formatValue(latest);
      if (this.legendValues[index].textContent !== text) this.legendValues[index].textContent = text;
    });
  }

  private draw(): void {
    const { canvas } = this.ui;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    const ratio = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    const log = this.log;
    if (log.rowCount === 0) return;

    const style = getComputedStyle(canvas);
    const ink = style.getPropertyValue("--monitor-text").trim() || "#ffffff";
    const fontSize = Math.min(MAX_LABEL_PX, parseFloat(style.fontSize) || 14);
    context.font = `${fontSize}px ${style.fontFamily}`;

    // The newest value sits at the right edge; while paused, the edge stays where it was.
    const span = Number(this.ui.windowPicker.value) * 1000;
    const end = this.paused ? this.frozenEnd : (log.times.at(-1) ?? 0);
    // Until the log is as long as the window, it starts at zero and stretches across the whole width.
    const start = Math.max(0, end - span);
    const range = Math.max(end - start, 1000);
    // One row before the window is included, so a line enters from the left edge instead of starting midway.
    const from = Math.max(0, firstIndexFrom(log.times, start) - 1);
    const to = firstIndexFrom(log.times, end + 1e-6);
    const shown = log.series.map((series, index) => ({ series, color: COLORS[index % COLORS.length] })).filter(({ series }) => !this.hiddenNames.has(series.name));

    let low = Infinity;
    let high = -Infinity;
    for (const { series } of shown) {
      for (let index = from; index < to; index++) {
        const value = series.values[index];
        if (value === undefined) continue;
        if (value < low) low = value;
        if (value > high) high = value;
      }
    }
    if (!Number.isFinite(low)) {
      low = 0;
      high = 1;
    } else if (low === high) {
      low -= 1;
      high += 1;
    } else {
      const pad = (high - low) * 0.08;
      low -= pad;
      high += pad;
    }

    const top = Math.round(fontSize * 0.8);
    const bottom = height - Math.round(fontSize * 2);
    const plotHeight = bottom - top;
    if (plotHeight <= 0) return;
    const yStep = niceStep(high - low, Math.max(2, Math.floor(plotHeight / (fontSize * 3))));
    const yTicks: number[] = [];
    for (let tick = Math.ceil(low / yStep) * yStep; tick <= high; tick += yStep) yTicks.push(tick);
    const yLabels = yTicks.map((tick) => formatValue(Math.abs(tick) < yStep / 1e6 ? 0 : tick));
    const left = Math.ceil(Math.max(...yLabels.map((label) => context.measureText(label).width), 0)) + 12;
    // The newest time label is centred on the right edge, so half of it needs room.
    const right = width - Math.max(12, Math.ceil(context.measureText(`${formatValue((start + range) / 1000)}s`).width / 2) + 4);
    const plotWidth = right - left;
    if (plotWidth <= 0) return;

    const x = (time: number) => left + ((time - start) / range) * plotWidth;
    const y = (value: number) => top + ((high - value) / (high - low)) * plotHeight;

    // Grid and labels.
    context.lineWidth = 1;
    context.strokeStyle = ink;
    context.fillStyle = ink;
    context.globalAlpha = 0.18;
    context.beginPath();
    yTicks.forEach((tick) => {
      const row = Math.round(y(tick)) + 0.5;
      context.moveTo(left, row);
      context.lineTo(right, row);
    });
    const xStep = niceStep(range / 1000, Math.max(2, Math.floor(plotWidth / (fontSize * 6))));
    const xTicks: number[] = [];
    for (let tick = Math.ceil(start / 1000 / xStep) * xStep; tick <= (start + range) / 1000 + 1e-9; tick += xStep) xTicks.push(tick);
    xTicks.forEach((tick) => {
      const column = Math.round(x(tick * 1000)) + 0.5;
      context.moveTo(column, top);
      context.lineTo(column, bottom);
    });
    context.stroke();
    context.globalAlpha = 0.85;
    context.textAlign = "right";
    context.textBaseline = "middle";
    yTicks.forEach((tick, index) => context.fillText(yLabels[index], left - 6, y(tick)));
    context.textAlign = "center";
    context.textBaseline = "top";
    xTicks.forEach((tick) => context.fillText(`${formatValue(tick)}s`, x(tick * 1000), bottom + 4));
    context.globalAlpha = 1;

    // Lines. Many rows can land on one pixel column, so each column draws only its lowest and highest values.
    context.save();
    context.beginPath();
    context.rect(left, top - 2, plotWidth, plotHeight + 4);
    context.clip();
    context.lineWidth = 2;
    context.lineJoin = "round";
    for (const { series, color } of shown) {
      context.strokeStyle = color;
      context.fillStyle = color;
      context.beginPath();
      let column = NaN;
      let lowest = 0;
      let highest = 0;
      let last = 0;
      let lastX = NaN;
      for (let index = from; index < to; index++) {
        const value = series.values[index];
        if (value === undefined) continue;
        const pointX = Math.round(x(log.times[index]));
        const pointY = y(value);
        if (pointX === column) {
          lowest = Math.max(lowest, pointY);
          highest = Math.min(highest, pointY);
          last = pointY;
          continue;
        }
        if (Number.isNaN(column)) {
          context.moveTo(pointX, pointY);
        } else {
          if (lowest !== highest) {
            context.lineTo(column, lowest);
            context.lineTo(column, highest);
          }
          context.lineTo(column, last);
          context.lineTo(pointX, pointY);
        }
        column = pointX;
        lowest = highest = last = pointY;
        lastX = pointX;
      }
      if (Number.isNaN(column)) continue;
      if (lowest !== highest) {
        context.lineTo(column, lowest);
        context.lineTo(column, highest);
        context.lineTo(column, last);
      }
      context.stroke();
      // A dot marks the newest value, so a single reading or a slow sensor still shows up.
      context.beginPath();
      context.arc(lastX, last, 3.5, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }
}
