// Spawning into a worker
console.log("spawning worker");
new Worker(new URL("./support/worker.ts", import.meta.url), {
  type: "module",
});
