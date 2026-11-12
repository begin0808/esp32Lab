import basicSsl from "@vitejs/plugin-basic-ssl";
import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

// package.json holds the one version number. Pages show it as v1.3, adding the last part only for a fix such as v1.3.1.
const { version } = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
process.env.VITE_APP_VERSION = version.replace(/\.0$/, "");

export default defineConfig(({ mode }) => ({
  // Relative paths let the site work under any GitHub Pages repository name.
  base: "./",
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 900,
    rollupOptions: { input: ["index.html", "voice.html", "dashboard.html", "help.html", "help.en.html"] },
  },
  // `npm run dev:phone` serves the site over https on the local network with a self-signed certificate,
  // because phones only share their tilt sensor with https pages. It is for testing on a phone only.
  plugins: mode === "phone" ? [basicSsl()] : [],
  test: { include: ["tests/unit/**/*.test.ts"] },
}));
