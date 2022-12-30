// Spawning into a worker
new Worker(new URL("./support/worker.ts", import.meta.url), {
  type: "module",
});
