import * as Comlink from "comlink";
// @ts-ignore -- todo
import DBWorker from "./dbworker.js?worker";
import { ComlinkableAPI } from "@vlcn.io/crsqlite-wasm/dist/comlinkable";
import "dbapi-ext.js";

const db = Comlink.wrap<ComlinkableAPI>(new DBWorker());

async function onReady() {
  const dbid = await db.open(/* optional file name */);
  await db.exec(dbid, "CREATE TABLE IF NOT EXISTS todo (id, text, completed)");

  // startApp();
}

function onError(e: any) {
  console.error(e);
}

db.onReady(Comlink.proxy(onReady), Comlink.proxy(onError));
