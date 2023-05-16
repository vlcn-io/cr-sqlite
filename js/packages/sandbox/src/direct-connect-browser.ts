import { WorkerInterface, newDbid } from "@vlcn.io/direct-connect-browser";
import workerUrl from "@vlcn.io/direct-connect-browser/shared.worker.js?url";
import wasmUrl from "@vlcn.io/crsqlite-wasm/crsqlite.wasm?url";
import initWasm from "@vlcn.io/crsqlite-wasm";
import tblrx from "@vlcn.io/rx-tbl";
import testSchema from "./schemas/testSchema.mjs";

const sqlite = await initWasm(() => wasmUrl);

// TODO: document how to get the dbid.
// Either from the URL, a document share, a login service, etc.
// const dbid = newDbid();
const dbid = "5421f3dc8eb548c1b07cf92bec2c459e" as any;
const db = await sqlite.open(dbid);

const syncWorker = new WorkerInterface(workerUrl, wasmUrl);
await db.automigrateTo(testSchema.name, testSchema.content);

const rx = tblrx(db);
syncWorker.startSync(
  dbid,
  {
    createOrMigrate: new URL("/sync/create-or-migrate", window.location.origin),
    getChanges: new URL("/sync/changes", window.location.origin),
    applyChanges: new URL("/sync/changes", window.location.origin),
    startOutboundStream: new URL(
      "/sync/start-outbound-stream",
      window.location.origin
    ),
    getLastSeen: new URL("/sync/last-seen", window.location.origin),
  },
  rx
);
