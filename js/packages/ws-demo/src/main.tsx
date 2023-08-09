import { WorkerInterface } from "@vlcn.io/ws-client";
import workerUrl from "@vlcn.io/ws-client/worker.js?url";
import syncConfigUrl from "./syncConfig.js?url";
console.log("hiya");

const worker = new WorkerInterface(
  syncConfigUrl,
  import.meta.env.DEV ? workerUrl : undefined
);

worker.startSync("some-db", {
  room: "some-room",
  url: "ws://localhost:8080/sync",
});

console.log("bya");
