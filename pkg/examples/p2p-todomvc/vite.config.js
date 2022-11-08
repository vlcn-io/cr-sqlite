// vite.config.js
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "es2020",
  },

  optimizeDeps: {
    esbuildOptions: {
      target: "es2020",
    },
  },
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});
