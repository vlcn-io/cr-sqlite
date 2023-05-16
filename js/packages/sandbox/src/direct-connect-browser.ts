import { WorkerInterface, newDbid } from "@vlcn.io/direct-connect-browser";
import workerUrl from "@vlcn.io/direct-connect-browser/shared.worker.js?url";
import wasmUrl from "@vlcn.io/crsqlite-wasm/crsqlite.wasm?url";
import initWasm from "@vlcn.io/crsqlite-wasm";
import tblrx from "@vlcn.io/rx-tbl";
import testSchema from "./schemas/testSchema.mjs";

const sqlite = await initWasm(() => wasmUrl);
const dbid = newDbid();
const db = await sqlite.open(dbid);

const syncWorker = new WorkerInterface(workerUrl, wasmUrl);

// Set up our db on the right schema version
// then start sync.
// Our server needs to do some slurping as well on startup.

db.automigrateTo(testSchema.name, testSchema.content);

const rx = tblrx(db);
syncWorker.startSync(
  dbid,
  {
    createOrMigrate: new URL("/sync/create-or-migrate", window.location.origin),
    getChanges: new URL("/sync/changes", window.location.origin),
    applyChanges: new URL("/sync/changes", window.location.origin),
    establishOutboundStream: new URL(
      "/sync/establish-outbound-stream",
      window.location.origin
    ),
    getLastSeen: new URL("/sync/last-seen", window.location.origin),
  },
  rx
);
