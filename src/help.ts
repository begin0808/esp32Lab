import { setupLanguagePicker, t, translatePage } from "./i18n";
import { setupExampleLinks, setupHomeLinks } from "./nav";
import { setupStats } from "./stats";
import { setupStylePicker } from "./theme";

translatePage();
setupStylePicker(document.getElementById("style-picker") as HTMLSelectElement);
setupLanguagePicker(document.getElementById("language-picker") as HTMLSelectElement);
setupHomeLinks();
setupExampleLinks((name) => confirm(t("要用「{name}」取代目前的程式嗎？", { name })));
setupStats();
setupToTop(document.getElementById("to-top") as HTMLButtonElement | null);

/** A button that appears once the page is scrolled down, and goes back to the top of the page. */
function setupToTop(button: HTMLButtonElement | null): void {
  if (!button) return;
  const show = () => {
    button.hidden = window.scrollY < 600;
  };
  window.addEventListener("scroll", show, { passive: true });
  show();
  button.addEventListener("click", () => {
    window.scrollTo({ top: 0 });
    // The button hides at the top, so the keyboard focus moves to the page title instead of getting lost.
    const title = document.querySelector<HTMLElement>(".help-top h1");
    title?.setAttribute("tabindex", "-1");
    title?.focus({ preventScroll: true });
  });
}
