// @ts-ignore -- todo
import DBWorker from "@vlcn.io/crsqlite-wasm/dist/comlinked?worker";

import wasmUrl from "@vlcn.io/crsqlite-wasm/dist/sqlite3.wasm?url";
import proxyUrl from "@vlcn.io/crsqlite-wasm/dist/sqlite3-opfs-async-proxy.js?url";
import { SQLite3 } from "@vlcn.io/crsqlite-wasm/dist/worker-wrapper";

async function onReady({ sqlite }: { sqlite: SQLite3 }) {
  console.log("ready");
  const db = await sqlite.open(/* optional file name */);

  await db.execMany([
    "CREATE TABLE foo (a, b);",
    "INSERT INTO foo VALUES (1, 2), (3, 4);",
  ]);

  const rows = await db.execO("SELECT * FROM foo");
  console.log(rows);

  db.close();
}

function onError(e: any) {
  console.error(e);
}

SQLite3.create(
  {
    wasmUrl: wasmUrl,
    proxyUrl: proxyUrl,
  },
  new DBWorker()
).then(onReady);
