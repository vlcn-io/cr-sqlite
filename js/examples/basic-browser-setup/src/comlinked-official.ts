import * as Comlink from "comlink";
// @ts-ignore -- todo
import DBWorker from "@vlcn.io/crsqlite-wasm/dist/comlinked?worker";
import { API } from "@vlcn.io/crsqlite-wasm/dist/comlinkable";

import wasmUrl from "@vlcn.io/crsqlite-wasm/dist/sqlite3.wasm?url";
import proxyUrl from "@vlcn.io/crsqlite-wasm/dist/sqlite3-opfs-async-proxy.js?url";

const sqlite = Comlink.wrap<API>(new DBWorker());

async function onReady() {
  console.log("ready");

  const db = await sqlite.open("comlinked-persist");

  await sqlite.execMany(db, [
    "CREATE TABLE IF NOT EXISTS foo (a, b);",
    "INSERT INTO foo VALUES (1, 2), (3, 4);",
  ]);

  const rows = await sqlite.execO(db, "SELECT * FROM foo");
  console.log(rows);

  sqlite.close(db);
}

function onError(e: any) {
  console.error(e);
}

sqlite.onReady(
  {
    wasmUrl: wasmUrl,
    proxyUrl: proxyUrl,
  },
  Comlink.proxy(onReady),
  Comlink.proxy(onError)
);
