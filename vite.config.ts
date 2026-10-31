import { defineConfig } from "vitest/config";

export default defineConfig({
  // Relative paths let the site work under any GitHub Pages repository name.
  base: "./",
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 900,
    rollupOptions: { input: ["index.html", "voice.html"] },
  },
  test: { include: ["tests/unit/**/*.test.ts"] },
});
