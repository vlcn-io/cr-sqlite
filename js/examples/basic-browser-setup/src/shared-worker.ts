// Spawning into a shared worker
new SharedWorker(new URL("./support/worker.ts", import.meta.url), {
  type: "module",
});
