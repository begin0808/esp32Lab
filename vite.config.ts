import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

// package.json holds the one version number. Pages show it as v1.3, adding the last part only for a fix such as v1.3.1.
const { version } = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
process.env.VITE_APP_VERSION = version.replace(/\.0$/, "");

export default defineConfig({
  // Relative paths let the site work under any GitHub Pages repository name.
  base: "./",
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 900,
    rollupOptions: { input: ["index.html", "voice.html", "dashboard.html", "help.html", "help.en.html"] },
  },
  test: { include: ["tests/unit/**/*.test.ts"] },
});
