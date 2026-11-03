import {
  baseName,
  canOpenInEditor,
  fileNameProblem,
  formatBytes,
  isNoSpaceError,
  joinPath,
  parentPath,
  pathSteps,
  type BoardEntry,
  type BoardListing,
} from "./files";
import { t } from "./i18n";
import type { RawRepl } from "./repl";

export interface FileManagerElements {
  dialog: HTMLDialogElement;
  space: HTMLElement;
  path: HTMLElement;
  list: HTMLElement;
  status: HTMLElement;
  upload: HTMLButtonElement;
  saveEditor: HTMLButtonElement;
  close: HTMLButtonElement;
  input: HTMLInputElement;
}

export interface FileManagerHost {
  getCode(): string;
  openInEditor(text: string, path: string): void;
  describeError(error: unknown): string;
}

const NAME_PROBLEMS = {
  empty: "請輸入檔名",
  slash: "檔名不能有 / 或 \\，要存到資料夾裡請先點進那個資料夾",
  dots: "檔名不能是 . 或 ..",
  long: "檔名太長了",
  control: "檔名裡有不能用的字元",
} as const;

/** The board's files in a dialog. The program stays stopped while it is open, because the REPL is in use. */
export class FileManager {
  private repl: RawRepl | null = null;
  private dir = "/";
  private listing: BoardListing = { entries: [], free: null, total: null };
  private working = false;
  private lastOpened: string | null = null;
  private onClosed: (() => void) | null = null;

  constructor(
    private readonly ui: FileManagerElements,
    private readonly host: FileManagerHost,
  ) {
    ui.close.addEventListener("click", () => this.close());
    ui.dialog.addEventListener("cancel", (event) => {
      if (this.working) event.preventDefault();
    });
    ui.dialog.addEventListener("close", () => {
      this.repl = null;
      this.onClosed?.();
      this.onClosed = null;
    });
    ui.upload.addEventListener("click", () => ui.input.click());
    ui.input.addEventListener("change", () => {
      const files = [...(ui.input.files ?? [])];
      ui.input.value = "";
      if (files.length) void this.uploadFiles(files);
    });
    ui.saveEditor.addEventListener("click", () => void this.saveEditor());
    ui.dialog.addEventListener("dragover", (event) => {
      if (!event.dataTransfer?.types.includes("Files")) return;
      event.preventDefault();
      ui.dialog.classList.toggle("dropping", !!this.repl && !this.working);
    });
    ui.dialog.addEventListener("dragleave", (event) => {
      if (event.target === ui.dialog) ui.dialog.classList.remove("dropping");
    });
    ui.dialog.addEventListener("drop", (event) => {
      event.preventDefault();
      ui.dialog.classList.remove("dropping");
      const files = [...(event.dataTransfer?.files ?? [])];
      if (files.length) void this.uploadFiles(files);
    });
  }

  get isOpen(): boolean {
    return this.ui.dialog.open;
  }

  /** Opens the dialog at once, so it can say what is happening while the board is still being stopped. */
  show(): void {
    this.repl = null;
    this.dir = "/";
    this.listing = { entries: [], free: null, total: null };
    this.render();
    this.setStatus(t("正在停止程式並讀取檔案…"));
    this.setWorking(true);
    this.ui.dialog.showModal();
  }

  /** Works with the board until the dialog closes. */
  async use(repl: RawRepl): Promise<void> {
    if (!this.isOpen) return;
    this.repl = repl;
    this.setWorking(false);
    const closed = this.closed();
    await this.task(t("正在讀取檔案…"), () => this.refresh());
    await closed;
  }

  /** Shows a problem that stopped the dialog from reaching the board, leaving only Close to press. */
  fail(message: string): void {
    this.repl = null;
    this.setWorking(false);
    this.setStatus(message, true);
    this.render();
  }

  closed(): Promise<void> {
    if (!this.isOpen) return Promise.resolve();
    return new Promise((resolve) => {
      const previous = this.onClosed;
      this.onClosed = () => {
        previous?.();
        resolve();
      };
    });
  }

  close(): void {
    if (this.isOpen) this.ui.dialog.close();
  }

  private setStatus(text: string, isError = false): void {
    this.ui.status.textContent = text;
    this.ui.status.classList.toggle("error", isError);
  }

  private setWorking(value: boolean): void {
    this.working = value;
    const usable = !value && !!this.repl;
    this.ui.upload.disabled = !usable;
    this.ui.saveEditor.disabled = !usable;
    this.ui.close.disabled = value;
    for (const button of this.ui.dialog.querySelectorAll<HTMLButtonElement>(".files-list button, .files-path button")) {
      button.disabled = !usable;
    }
  }

  /** Runs one job at a time and reports its failure in the dialog instead of the monitor. */
  private async task(label: string, work: () => Promise<string | void>): Promise<void> {
    if (this.working || !this.repl) return;
    this.setWorking(true);
    this.setStatus(label);
    try {
      this.setStatus((await work()) ?? "");
    } catch (error) {
      const message = this.host.describeError(error);
      this.setStatus(isNoSpaceError(message) ? t("板子的空間不夠了，請先刪掉一些用不到的檔案。") : message, true);
    } finally {
      this.setWorking(false);
    }
  }

  private async refresh(): Promise<void> {
    if (!this.repl) return;
    this.listing = await this.repl.listDir(this.dir);
    this.render();
  }

  private async goTo(dir: string): Promise<void> {
    const previous = this.dir;
    this.dir = dir;
    await this.task(t("正在讀取檔案…"), async () => {
      try {
        await this.refresh();
      } catch (error) {
        this.dir = previous;
        throw error;
      }
    });
  }

  private render(): void {
    const { free, total, entries } = this.listing;
    this.ui.space.textContent =
      free !== null && total !== null ? t("剩餘 {free}，共 {total}", { free: formatBytes(free), total: formatBytes(total) }) : "";

    this.ui.path.replaceChildren(
      ...pathSteps(this.dir).flatMap((step, index, steps) => {
        const last = index === steps.length - 1;
        const item = last ? document.createElement("strong") : document.createElement("button");
        item.textContent = step.name;
        if (item instanceof HTMLButtonElement) {
          item.type = "button";
          item.className = "link-button";
          item.addEventListener("click", () => void this.goTo(step.path));
        } else {
          item.setAttribute("aria-current", "location");
        }
        return index === 0 ? [item] : [Object.assign(document.createElement("span"), { textContent: "›", ariaHidden: "true" }), item];
      }),
    );

    const rows: HTMLElement[] = [];
    if (this.dir !== "/") rows.push(this.row({ name: "..", isDir: true, size: 0 }, parentPath(this.dir), t("上一層")));
    for (const entry of entries) rows.push(this.row(entry, joinPath(this.dir, entry.name)));
    if (!entries.length && this.repl) {
      rows.push(Object.assign(document.createElement("li"), { className: "files-empty", textContent: t("這個資料夾是空的") }));
    }
    this.ui.list.replaceChildren(...rows);
    this.setWorking(this.working);
  }

  private row(entry: BoardEntry, path: string, label?: string): HTMLElement {
    const li = document.createElement("li");
    li.className = entry.isDir ? "files-row dir" : "files-row";
    const icon = Object.assign(document.createElement("span"), { className: "files-icon", textContent: entry.isDir ? "📁" : "📄", ariaHidden: "true" });
    let name: HTMLElement;
    if (entry.isDir) {
      name = this.button(label ?? entry.name, () => void this.goTo(path), "link-button files-name");
      if (label) name.title = label;
    } else {
      name = Object.assign(document.createElement("span"), { className: "files-name", textContent: entry.name });
    }
    li.append(icon, name);
    if (label) return li;

    li.append(Object.assign(document.createElement("span"), { className: "files-size", textContent: entry.isDir ? "" : formatBytes(entry.size) }));
    const actions = document.createElement("span");
    actions.className = "files-row-actions";
    if (canOpenInEditor(entry)) actions.append(this.button(t("開到編輯器"), () => void this.openInEditor(entry, path)));
    if (!entry.isDir) actions.append(this.button(t("下載"), () => void this.download(entry, path)));
    const remove = this.button(t("刪除"), () => void this.remove(entry, path), "btn small danger");
    actions.append(remove);
    li.append(actions);
    return li;
  }

  private button(text: string, action: () => void, className = "btn small"): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = text;
    button.addEventListener("click", action);
    return button;
  }

  private async openInEditor(entry: BoardEntry, path: string): Promise<void> {
    if (!confirm(t("要用 {name} 取代編輯器裡的程式嗎？", { name: entry.name }))) return;
    let text: string | null = null;
    await this.task(t("正在讀取 {name}…", { name: entry.name }), async () => {
      const data = await this.repl!.readFile(path, entry.size);
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(data);
      } catch {
        throw new Error(t("{name} 不是 UTF-8 文字檔，無法開到編輯器，可以改用「下載」。", { name: entry.name }));
      }
    });
    if (text === null) return;
    this.lastOpened = path;
    this.close();
    this.host.openInEditor(text, path);
  }

  private async download(entry: BoardEntry, path: string): Promise<void> {
    await this.task(t("正在下載 {name}…", { name: entry.name }), async () => {
      const data = await this.repl!.readFile(path, entry.size);
      const anchor = document.createElement("a");
      anchor.href = URL.createObjectURL(new Blob([data as BlobPart], { type: "application/octet-stream" }));
      anchor.download = entry.name;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
      return t("已下載 {name}", { name: entry.name });
    });
  }

  private async remove(entry: BoardEntry, path: string): Promise<void> {
    let question = entry.isDir ? t("要刪除資料夾 {name} 嗎？", { name: entry.name }) : t("要刪除 {name} 嗎？刪除後無法復原。", { name: entry.name });
    if (path === "/boot.py") question += `\n\n${t("boot.py 是開機時最先執行的檔案。刪掉後板子還是能用，但裡面的設定會不見。")}`;
    if (path === "/main.py") question += `\n\n${t("刪掉 main.py 後，板子開機就不會自動執行程式。")}`;
    if (!confirm(question)) return;
    await this.task(t("正在刪除 {name}…", { name: entry.name }), async () => {
      const removed = await this.repl!.remove(path, entry.isDir);
      if (!removed) throw new Error(t("資料夾 {name} 裡還有檔案，請先刪掉裡面的檔案。", { name: entry.name }));
      if (this.lastOpened === path) this.lastOpened = null;
      await this.refresh();
      return t("已刪除 {name}", { name: entry.name });
    });
  }

  /** Asks before replacing a file, and refuses a name a folder already has. Returns false to skip this one. */
  private mayWrite(name: string): boolean {
    const existing = this.listing.entries.find((entry) => entry.name === name);
    if (!existing) return true;
    if (existing.isDir) {
      this.setStatus(t("這裡已經有叫 {name} 的資料夾，請換一個檔名。", { name }), true);
      return false;
    }
    return confirm(t("{name} 已經存在，要覆蓋嗎？", { name }));
  }

  private async writeOne(name: string, data: Uint8Array): Promise<void> {
    const { free } = this.listing;
    const existing = this.listing.entries.find((entry) => entry.name === name)?.size ?? 0;
    if (free !== null && data.length > free + existing) throw new Error(t("板子的空間不夠了，請先刪掉一些用不到的檔案。"));
    const label = t("正在上傳 {name}…", { name });
    await this.repl!.writeFile(joinPath(this.dir, name), data, (fraction) => this.setStatus(`${label} ${Math.round(fraction * 100)}%`));
  }

  private async uploadFiles(files: File[]): Promise<void> {
    if (!this.repl || this.working) return;
    const chosen: File[] = [];
    for (const file of files) {
      const problem = fileNameProblem(file.name);
      if (problem) {
        this.setStatus(`${file.name}：${t(NAME_PROBLEMS[problem])}`, true);
        return;
      }
      if (this.mayWrite(file.name)) chosen.push(file);
    }
    if (!chosen.length) return;
    await this.task(t("正在上傳…"), async () => {
      for (const file of chosen) await this.writeOne(file.name, new Uint8Array(await file.arrayBuffer()));
      await this.refresh();
      return chosen.length === 1
        ? t("已上傳 {name}", { name: joinPath(this.dir, chosen[0].name) })
        : t("已上傳 {count} 個檔案到 {folder}", { count: chosen.length, folder: this.dir });
    });
  }

  private async saveEditor(): Promise<void> {
    if (!this.repl || this.working) return;
    const suggested = this.lastOpened && parentPath(this.lastOpened) === this.dir ? baseName(this.lastOpened) : "mylib.py";
    const typed = prompt(t("要把編輯器裡的程式存成什麼檔名？會存在 {folder}。", { folder: this.dir }), suggested);
    if (typed === null) return;
    const name = typed.trim();
    const problem = fileNameProblem(name);
    if (problem) {
      this.setStatus(t(NAME_PROBLEMS[problem]), true);
      return;
    }
    if (!this.mayWrite(name)) return;
    await this.task(t("正在上傳 {name}…", { name }), async () => {
      await this.writeOne(name, new TextEncoder().encode(this.host.getCode()));
      await this.refresh();
      return t("已存成 {path}", { path: joinPath(this.dir, name) });
    });
  }
}
