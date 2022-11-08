import * as Comlink from "comlink";
// @ts-ignore -- todo
import DBWorker from "@vlcn.io/crsqlite-wasm/dist/comlinked?worker";
import { API } from "@vlcn.io/crsqlite-wasm/dist/comlinked";

const db = Comlink.wrap<API>(new DBWorker());

async function onReady() {
  await db.open(/* optional file name */);
  await db.exec("CREATE TABLE IF NOT EXISTS todo (id, text, completed)");

  // startApp();
}

function onError(e: any) {
  console.error(e);
}

db.onReady(Comlink.proxy(onReady), Comlink.proxy(onError));
