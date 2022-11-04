// Spawning into a worker
console.log("You likely would rather use `comlink.ts`");
new Worker(new URL("./support/worker.ts", import.meta.url), {
  type: "module",
});
