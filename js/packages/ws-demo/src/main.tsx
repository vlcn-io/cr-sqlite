import { WorkerInterface } from "@vlcn.io/ws-client";
import workerUrl from "@vlcn.io/ws-client/worker.js?url";
import syncConfigUrl from "./syncConfig.js?url";
import initWasm, { SQLite3 } from "@vlcn.io/crsqlite-wasm";
import wasmUrl from "@vlcn.io/crsqlite-wasm/crsqlite.wasm?url";
import schemaContent from "./schemas/main.sql?raw";

initWasm(() => wasmUrl).then(startApp);

async function startApp(sqlite: SQLite3) {
  console.log("start app");
  const db = await sqlite.open("some-db");
  await db.automigrateTo("main.sql", schemaContent);
  await startSync();
}

async function startSync() {
  const worker = new WorkerInterface(
    syncConfigUrl,
    import.meta.env.DEV ? workerUrl : undefined
  );

  // Kicks off sync in a webworker.
  worker.startSync("some-db", {
    room: "some-room",
    url: "ws://localhost:8080/sync",
  });
}
