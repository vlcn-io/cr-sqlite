// Spawning into a worker
console.log("Try running the db in a worker");
new Worker(new URL("./support/worker.ts", import.meta.url), {
  type: "module",
});
