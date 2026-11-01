import { t } from "./i18n";

const STATS_SITE = "https://esp32lab.goatcounter.com";
const LIVE_HOST = "begin0808.github.io";
// The all-time count keeps a "not found" for 4 hours. An explicit start from before launch covers
// the same visits, and the server stores its result separately.
const EDITOR_COUNT = "/counter//esp32Lab.json?start=2026-01-01";

/**
 * Sends only the page path and where the visitor came from. The voice page's query holds an MQTT
 * topic name that can control a board, so it must never reach the statistics.
 */
export function hitUrl(page: URL, title: string, referrer: string): string {
  const params = new URLSearchParams({ p: page.pathname.replace(/\/index\.html$/, "/"), t: title, rnd: String(Math.random()) });
  try {
    const origin = new URL(referrer).origin;
    if (origin !== page.origin) params.set("r", origin);
  } catch {
    // No referrer, or one that is not a URL.
  }
  return `${STATS_SITE}/count?${params}`;
}

async function showVisitCount(): Promise<void> {
  const node = document.getElementById("visit-count");
  if (!node) return;
  try {
    const response = await fetch(STATS_SITE + EDITOR_COUNT);
    if (!response.ok) return;
    const { count } = (await response.json()) as { count?: unknown };
    if (typeof count !== "string" || !/[1-9]/.test(count)) return;
    node.textContent = t("累計瀏覽 {count} 人次", { count });
    node.hidden = false;
  } catch {
    // The page works the same without the counter.
  }
}

/** Uses a plain image request instead of a third-party script, which could read the code and Wi-Fi password this site stores. */
export function setupStats(): void {
  if (location.hostname === LIVE_HOST) {
    new Image().src = hitUrl(new URL(location.href), document.title, document.referrer);
  }
  void showVisitCount();
}
