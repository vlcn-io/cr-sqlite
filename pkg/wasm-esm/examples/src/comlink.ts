import * as Comlink from "comlink";
// @ts-ignore -- todo
import DBWorker from '@vlcn.io/crsqlite-wasm/dist/comlinked?worker';
import {API} from '@vlcn.io/crsqlite-wasm/dist/comlinked';

const db = Comlink.wrap(new DBWorker()) as API;

async function onReady() {
  console.log('ready');

  await db.open(/* optional file name */);

  await db.exec([
    "CREATE TABLE foo (a, b);",
    "INSERT INTO foo VALUES (1, 2), (3, 4);"
  ]);

  const rows = await db.execO("SELECT * FROM foo");
  console.log(rows);
}

function onError(e: any) {
  console.error(e);
}

db.onReady(Comlink.proxy(onReady), Comlink.proxy(onError));