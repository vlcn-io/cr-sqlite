// vite.config.js
import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
  plugins: [solidPlugin()],
  server: {
    fs: {
      strict: false,
    },
    // headers: {
    //   "Cross-Origin-Opener-Policy": "same-origin",
    //   "Cross-Origin-Embedder-Policy": "require-corp",
    // },
  },
});
