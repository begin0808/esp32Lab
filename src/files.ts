// Pure helpers for the board's file manager: paths, names, sizes and the listing the board prints.

export interface BoardEntry {
  name: string;
  isDir: boolean;
  size: number;
}

export interface BoardListing {
  entries: BoardEntry[];
  /** Bytes, or null when the board did not say. */
  free: number | null;
  total: number | null;
}

/** Files that open in the editor. Anything else can still be downloaded. */
export const TEXT_EXTENSIONS = ["py", "txt", "json", "csv", "html", "htm", "css", "js", "md", "cfg", "ini", "toml", "yaml", "yml", "xml", "svg"];
/** Larger files make the editor slow, and are never something a student wrote by hand. */
export const EDITOR_MAX_BYTES = 100 * 1024;
/** The upload's temporary file, which is never shown. */
export const HIDDEN_NAMES = [".upload.tmp"];

export function joinPath(dir: string, name: string): string {
  return dir === "/" ? `/${name}` : `${dir}/${name}`;
}

export function parentPath(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut <= 0 ? "/" : path.slice(0, cut);
}

export function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** Each folder on the way to `path`, for the clickable path above the list. */
export function pathSteps(path: string): { name: string; path: string }[] {
  const steps = [{ name: "/", path: "/" }];
  let current = "";
  for (const part of path.split("/").filter(Boolean)) {
    current += `/${part}`;
    steps.push({ name: part, path: current });
  }
  return steps;
}

export function isTextName(name: string): boolean {
  const dot = name.lastIndexOf(".");
  return dot > 0 && TEXT_EXTENSIONS.includes(name.slice(dot + 1).toLowerCase());
}

export function canOpenInEditor(entry: BoardEntry): boolean {
  return !entry.isDir && entry.size <= EDITOR_MAX_BYTES && isTextName(entry.name);
}

/** Returns a reason the name cannot be used, or null when it is fine. Folders are chosen by browsing, not typed. */
export function fileNameProblem(name: string): "empty" | "slash" | "dots" | "long" | "control" | null {
  if (!name) return "empty";
  if (name.includes("/") || name.includes("\\")) return "slash";
  if (name === "." || name === "..") return "dots";
  if (new TextEncoder().encode(name).length > 64) return "long";
  if (/[\x00-\x1f\x7f]/.test(name)) return "control";
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Reads what the board printed: one line per entry, "d|0|name" for a folder or "f|size|name" for a file,
 * then "#|free|total". Folders come first, then everything by name.
 */
export function parseListing(output: string): BoardListing {
  const entries: BoardEntry[] = [];
  let free: number | null = null;
  let total: number | null = null;
  for (const line of output.split(/\r?\n/)) {
    const first = line.indexOf("|");
    const second = line.indexOf("|", first + 1);
    if (first !== 1 || second < 0) continue;
    const kind = line[0];
    const number = Number(line.slice(first + 1, second));
    const rest = line.slice(second + 1);
    if (kind === "#") {
      free = Number.isFinite(number) && number >= 0 ? number : null;
      const size = Number(rest);
      total = Number.isFinite(size) && size > 0 ? size : null;
    } else if ((kind === "d" || kind === "f") && rest && !HIDDEN_NAMES.includes(rest)) {
      entries.push({ name: rest, isDir: kind === "d", size: kind === "f" && Number.isFinite(number) ? number : 0 });
    }
  }
  entries.sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name, "en"));
  return { entries, free, total };
}

/** Reads a file the board printed as base64 lines followed by "#" and its SHA-256. */
export function parseFileDump(output: string): { data: Uint8Array; sha256: string } {
  const pieces: Uint8Array[] = [];
  let sha256 = "";
  for (const raw of output.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#")) {
      sha256 = line.slice(1);
      continue;
    }
    const binary = atob(line);
    const piece = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) piece[i] = binary.charCodeAt(i);
    pieces.push(piece);
  }
  const data = new Uint8Array(pieces.reduce((sum, piece) => sum + piece.length, 0));
  let offset = 0;
  for (const piece of pieces) {
    data.set(piece, offset);
    offset += piece.length;
  }
  return { data, sha256 };
}

/** A board error that means the flash is full. */
export function isNoSpaceError(message: string): boolean {
  return /ENOSPC|Errno 28\b|OSError: 28\b/.test(message);
}
