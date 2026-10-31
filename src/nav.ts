/** True when this tab was opened from the editor, which must keep running and stay connected to the board. */
function openedFromEditor(): boolean {
  try {
    const opener = window.opener as Window | null;
    return !!opener && !opener.closed && /\/(index\.html)?$/.test(opener.location.pathname);
  } catch {
    return false;
  }
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
      (window.opener as Window).focus();
      window.close();
      // Browsers may refuse to close the tab, and the student must not be left stuck on this page.
      setTimeout(() => {
        if (!window.closed) location.href = link.href;
      }, 200);
    });
  }
}
