// vite.config.js
import { resolve } from "path";
import { defineConfig, searchForWorkspaceRoot } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        mainThread: resolve(__dirname, "main-thread.html"),
        onWorker: resolve(__dirname, "on-worker.html"),
        comlink: resolve(__dirname, "comlink.html"),
      },
    },
  },
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
    fs: {
      allow: [
        // search up for workspace root
        searchForWorkspaceRoot(process.cwd()),
      ],
    },
  },
});
