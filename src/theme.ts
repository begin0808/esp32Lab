const STYLE_KEY = "esp32-mp-style";

export const STYLES = [
  { id: "mat", name: "切割墊工作台" },
  { id: "blocks", name: "積木玩具" },
];

// Chinese fonts are large, so each one is fetched only when its style is chosen.
const FONT_LOADERS: Record<string, () => Promise<unknown>> = {
  blocks: () => import("@fontsource/huninn/400.css"),
};

function readStyle(): string {
  try {
    const saved = localStorage.getItem(STYLE_KEY);
    if (STYLES.some((style) => style.id === saved)) return saved!;
  } catch {
    // Fall through to the default when the browser blocks storage.
  }
  return STYLES[0].id;
}

function applyStyle(id: string): void {
  document.documentElement.dataset.style = id;
  // The style still works with the system font if this download fails.
  FONT_LOADERS[id]?.().catch(() => {});
}

/** Fills the style menu; pages stay in sync because they share one saved choice. */
export function setupStylePicker(picker: HTMLSelectElement): void {
  picker.append(...STYLES.map((style) => new Option(style.name, style.id)));
  picker.value = readStyle();
  applyStyle(picker.value);
  picker.addEventListener("change", () => {
    applyStyle(picker.value);
    try {
      localStorage.setItem(STYLE_KEY, picker.value);
    } catch {
      // The chosen style still applies until the page is closed.
    }
  });
}
