import * as Comlink from "comlink";
// @ts-ignore -- todo
import DBWorker from "@vlcn.io/crsqlite-wasm/dist/comlinked?worker";
import { API } from "@vlcn.io/crsqlite-wasm/dist/comlinkable";

const sqlite = Comlink.wrap<API>(new DBWorker());

async function onReady() {
  console.log("ready");

  const db = await sqlite.open(/* optional file name */);

  await sqlite.execMany(db, [
    "CREATE TABLE foo (a, b);",
    "INSERT INTO foo VALUES (1, 2), (3, 4);",
  ]);

  const rows = await sqlite.execO(db, "SELECT * FROM foo");
  console.log(rows);

  sqlite.close(db);
}

function onError(e: any) {
  console.error(e);
}

sqlite.onReady(Comlink.proxy(onReady), Comlink.proxy(onError));
