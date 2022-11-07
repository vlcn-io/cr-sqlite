// vite.config.js
import { resolve } from "path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "es2020",
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        mainThread: resolve(__dirname, "main-thread.html"),
        onWorker: resolve(__dirname, "on-worker.html"),
        comlink: resolve(__dirname, "comlink.html"),
      },
    },
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
