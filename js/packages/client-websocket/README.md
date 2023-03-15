# @vlcn.io/client-websocket

```ts
import startSync from "@vlcn.io/client-websocket";
import initWasm from "@vlcn.io/crsqlite-wasm";
import wasmUrl from "@vlcn.io/crsqlite-wasm/crsqlite.wasm?url";
import tblrx from "@vlcn.io/rx-tbl";

const sqlite = await initWasm((_file) => wasmUrl);
const db = await sqlite.open(dbid);
const rx = tblrx(db);

const sync = await startSync(`wss://${window.location.hostname}/sync`, {
  localDb: db, // instance of the local database
  remoteDbId: dbid, // id of the database on the server
  create: { // optional -- to allow the server to auto-create the DB if it does not exist
    schemaName: "name-of-schema",
  },
  rx, // reactivity module to notify sync when the db changed
});
```
