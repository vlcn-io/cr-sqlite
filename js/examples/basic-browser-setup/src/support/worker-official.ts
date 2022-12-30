import sqliteWasm from "@vlcn.io/crsqlite-wasm";

import wasmUrl from "@vlcn.io/crsqlite-wasm/dist/sqlite3.wasm?url";
import proxyUrl from "@vlcn.io/crsqlite-wasm/dist/sqlite3-opfs-async-proxy.js?url";

sqliteWasm({
  locateWasm: () => wasmUrl,
  locateProxy: () => proxyUrl,
}).then((sqlite3) => {
  const db = sqlite3.open("example-db", "c");

  db.execMany([
    "CREATE TABLE IF NOT EXISTS baz (a, b);",
    "INSERT INTO baz VALUES (1, 2);",
  ]);

  const rows = db.execA("SELECT * FROM baz");
  console.log(rows);

  db.close();
});
