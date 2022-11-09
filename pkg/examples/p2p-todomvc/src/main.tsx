import * as React from "react";
import { createRoot } from "react-dom/client";
import { stringify as uuidStringify } from "uuid";

import * as Comlink from "comlink";
// @ts-ignore -- todo
import DBWorker from "./dbworker.js?worker";
import { ComlinkableAPI } from "@vlcn.io/crsqlite-wasm/dist/comlinkable";
import "./dbapi-ext.js";
import App from "./App";
import { Ctx } from "./hooks";

const w = new DBWorker();
const sqlite = Comlink.wrap<ComlinkableAPI>(w);

async function onReady() {
  const dbid = await sqlite.open();
  // "p2pwdb-todo-example"
  await sqlite.exec(
    dbid,
    "CREATE TABLE IF NOT EXISTS todo (id, text, completed)"
  );
  const siteid = uuidStringify(
    (await sqlite.execA(dbid, "SELECT crsql_siteid()"))[0][0]
  );
  sqlite.schemaChanged(dbid);

  startApp({
    dbid,
    sqlite,
    siteid,
  });

  window.onbeforeunload = () => {
    return sqlite.close(dbid);
  };
}

function startApp(ctx: Ctx) {
  (window as any).ctx = ctx;
  const root = createRoot(document.getElementById("container")!);
  root.render(<App ctx={ctx} />);
}

function onError(e: any) {
  console.error(e);
}

sqlite.onReady(Comlink.proxy(onReady), Comlink.proxy(onError));
