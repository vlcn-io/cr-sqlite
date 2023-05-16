// vite.config.js
import { resolve } from "path";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    target: "esnext",
    rollupOptions: {
      input: {
        page1: resolve(__dirname, "direct-connect-browser.html"),
        page2: resolve(__dirname, "page2.html"),
      },
    },
  },

  optimizeDeps: {
    esbuildOptions: {
      target: "esnext",
    },
  },
});
