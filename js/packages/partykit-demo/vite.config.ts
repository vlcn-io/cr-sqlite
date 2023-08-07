// vite.config.js
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    target: "esnext",
  },

  optimizeDeps: {
    esbuildOptions: {
      target: "esnext",
    },
  },
});
