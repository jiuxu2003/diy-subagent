import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

const tauriHost = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: tauriHost ?? false,
    ...(tauriHost
      ? {
        hmr: {
          protocol: "ws",
          host: tauriHost,
          port: 1421,
        },
      }
      : {}),
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    target: ["es2022", "chrome105", "safari13"],
    minify: process.env.TAURI_DEBUG === "true" ? false : "oxc",
    sourcemap: process.env.TAURI_DEBUG === "true",
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    exclude: [...configDefaults.exclude, "tests/e2e/**"],
    css: true,
    coverage: {
      reporter: ["text", "html"],
    },
  },
});
