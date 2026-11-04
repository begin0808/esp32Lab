/** True when this tab was opened from the editor, which must keep running and stay connected to the board. */
export function openedFromEditor(): boolean {
  try {
    const opener = window.opener as Window | null;
    return !!opener && !opener.closed && /\/(index\.html)?$/.test(opener.location.pathname);
  } catch {
    return false;
  }
}

/** Closes this tab to show the editor that opened it, or loads `fallback` if the browser keeps the tab open. */
export function returnToEditor(fallback: string): void {
  (window.opener as Window).focus();
  window.close();
  // Browsers may refuse to close the tab, and the student must not be left stuck on this page.
  setTimeout(() => {
    if (!window.closed) location.href = fallback;
  }, 200);
}

/**
 * Returns to the open editor tab when there is one, because loading a second editor would not
 * share its board connection. A tab that cannot do this simply follows the link instead.
 */
export function setupHomeLinks(): void {
  for (const link of document.querySelectorAll<HTMLAnchorElement>(".home-link")) {
    link.addEventListener("click", (event) => {
      if (!openedFromEditor()) return;
      event.preventDefault();
      returnToEditor(link.href);
    });
  }
}

/**
 * Example links on the help page load the example into the editor that opened the page, so its board
 * connection is kept. Opened on its own, the page follows the link and the editor asks there instead.
 */
export function setupExampleLinks(confirmReplace: (name: string) => boolean): void {
  for (const link of document.querySelectorAll<HTMLAnchorElement>("a.example-link")) {
    link.addEventListener("click", (event) => {
      if (!openedFromEditor()) return;
      event.preventDefault();
      if (!confirmReplace(link.textContent ?? "")) return;
      const id = new URL(link.href).searchParams.get("example");
      (window.opener as Window).postMessage({ type: "load-example", id }, location.origin);
      // The example is already in the editor, so a tab that stays open must not load it a second time.
      returnToEditor(new URL("./index.html", location.href).href);
    });
  }
}
