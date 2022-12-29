// vite.config.js
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "es2020",
  },

  optimizeDeps: {
    esbuildOptions: {
      target: "es2020",
      mainFields: ["module", "main"],
    },
  },
});
