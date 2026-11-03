import { describe, expect, it } from "vitest";
import {
  baseName,
  canOpenInEditor,
  EDITOR_MAX_BYTES,
  fileNameProblem,
  formatBytes,
  isNoSpaceError,
  joinPath,
  parentPath,
  parseFileDump,
  parseListing,
  pathSteps,
} from "../../src/files";

describe("paths", () => {
  it("joins, splits and steps through folders", () => {
    expect(joinPath("/", "main.py")).toBe("/main.py");
    expect(joinPath("/lib", "ssd1306.py")).toBe("/lib/ssd1306.py");
    expect(parentPath("/lib/ssd1306.py")).toBe("/lib");
    expect(parentPath("/lib")).toBe("/");
    expect(parentPath("/")).toBe("/");
    expect(baseName("/lib/ssd1306.py")).toBe("ssd1306.py");
    expect(pathSteps("/")).toEqual([{ name: "/", path: "/" }]);
    expect(pathSteps("/lib/sub")).toEqual([
      { name: "/", path: "/" },
      { name: "lib", path: "/lib" },
      { name: "sub", path: "/lib/sub" },
    ]);
  });
});

describe("fileNameProblem", () => {
  it("accepts ordinary names, including Chinese ones", () => {
    for (const name of ["mylib.py", "data.txt", "溫度紀錄.csv", ".hidden", "a b.py"]) expect(fileNameProblem(name), name).toBeNull();
  });

  it("names what is wrong with a name", () => {
    expect(fileNameProblem("")).toBe("empty");
    expect(fileNameProblem("lib/x.py")).toBe("slash");
    expect(fileNameProblem("a\\b.py")).toBe("slash");
    expect(fileNameProblem("..")).toBe("dots");
    expect(fileNameProblem("溫".repeat(22))).toBe("long");
    expect(fileNameProblem("a\nb")).toBe("control");
  });
});

describe("canOpenInEditor", () => {
  it("opens small text files only", () => {
    expect(canOpenInEditor({ name: "main.py", isDir: false, size: 100 })).toBe(true);
    expect(canOpenInEditor({ name: "DATA.CSV", isDir: false, size: 100 })).toBe(true);
    expect(canOpenInEditor({ name: "photo.jpg", isDir: false, size: 100 })).toBe(false);
    expect(canOpenInEditor({ name: "README", isDir: false, size: 100 })).toBe(false);
    expect(canOpenInEditor({ name: "big.py", isDir: false, size: EDITOR_MAX_BYTES + 1 })).toBe(false);
    expect(canOpenInEditor({ name: "lib.py", isDir: true, size: 0 })).toBe(false);
  });
});

describe("formatBytes", () => {
  it("picks a readable unit", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(4300)).toBe("4.2 KB");
    expect(formatBytes(1835008)).toBe("1.8 MB");
  });
});

describe("parseListing", () => {
  it("puts folders first, sorts by name, hides the upload's temporary file and reads the space", () => {
    const output = ["f|120|main.py", "d|0|lib", "f|4300|boot.py", "f|9|.upload.tmp", "f|5|名 稱|有直線.txt", "#|1835008|2097152", ""].join("\r\n");
    expect(parseListing(output)).toEqual({
      entries: [
        { name: "lib", isDir: true, size: 0 },
        { name: "boot.py", isDir: false, size: 4300 },
        { name: "main.py", isDir: false, size: 120 },
        { name: "名 稱|有直線.txt", isDir: false, size: 5 },
      ],
      free: 1835008,
      total: 2097152,
    });
  });

  it("copes with an empty folder and a board that does not report its space", () => {
    expect(parseListing("")).toEqual({ entries: [], free: null, total: null });
  });
});

describe("parseFileDump", () => {
  it("joins the base64 pieces and reads the digest", () => {
    const { data, sha256 } = parseFileDump("5rqr\r\nAP8=\r\n#abc123\r\n");
    expect([...data]).toEqual([0xe6, 0xba, 0xab, 0x00, 0xff]);
    expect(sha256).toBe("abc123");
  });

  it("reads an empty file", () => {
    const { data, sha256 } = parseFileDump("#e3b0\r\n");
    expect(data.length).toBe(0);
    expect(sha256).toBe("e3b0");
  });
});

describe("isNoSpaceError", () => {
  it("recognises the ways MicroPython reports a full flash", () => {
    expect(isNoSpaceError("OSError: [Errno 28] ENOSPC")).toBe(true);
    expect(isNoSpaceError("OSError: 28")).toBe(true);
    expect(isNoSpaceError("OSError: [Errno 2] ENOENT")).toBe(false);
    expect(isNoSpaceError("OSError: 280")).toBe(false);
  });
});
