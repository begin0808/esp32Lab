import { helpPageFor } from "./helppages";
import { lang, setupLanguagePicker, t, translatePage } from "./i18n";
import { setupExampleLinks, setupHomeLinks } from "./nav";
import { setupStats } from "./stats";
import { setupStylePicker } from "./theme";

redirectToSectionPage();
translatePage();
setupStylePicker(document.getElementById("style-picker") as HTMLSelectElement);
setupLanguagePicker(document.getElementById("language-picker") as HTMLSelectElement);
setupHomeLinks();
setupExampleLinks((name) => confirm(t("要用「{name}」取代目前的程式嗎？", { name })));
setupStats();
setupToTop(document.getElementById("to-top") as HTMLButtonElement | null);
setupCopyButtons();

/** An older link such as help.html#dashboard names a section that now lives on its own page, so it goes there. */
function redirectToSectionPage(): void {
  const id = decodeURIComponent(location.hash.slice(1));
  if (!id || document.getElementById(id)) return;
  const page = helpPageFor(id);
  if (page) location.replace(`./${page}${lang === "en" ? ".en" : ""}.html${location.hash}`);
}

/** Each code box gets a button that copies all of it, so nobody misses the first or the last line. */
function setupCopyButtons(): void {
  for (const block of document.querySelectorAll<HTMLElement>(".code-block")) {
    const wrap = document.createElement("div");
    wrap.className = "code-wrap";
    block.replaceWith(wrap);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "copy-code";
    button.textContent = t("複製");
    wrap.append(block, button);
    let timer: ReturnType<typeof setTimeout> | undefined;
    button.addEventListener("click", async () => {
      let copied = true;
      try {
        await navigator.clipboard.writeText(block.textContent ?? "");
      } catch {
        copied = false;
        // With the code selected, Ctrl+C still copies it by hand.
        getSelection()?.selectAllChildren(block);
      }
      button.textContent = copied ? t("已複製") : t("複製失敗");
      clearTimeout(timer);
      timer = setTimeout(() => {
        button.textContent = t("複製");
      }, 2000);
    });
  }
}

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
