import * as React from "react";
import { createRoot } from "react-dom/client";

import * as Comlink from "comlink";
// @ts-ignore -- todo
import DBWorker from "./dbworker.js?worker";
import { ComlinkableAPI } from "@vlcn.io/crsqlite-wasm/dist/comlinkable";
import "./dbapi-ext.js";
import App from "./App";

const w = new DBWorker();
const sqlite = Comlink.wrap<ComlinkableAPI>(w);

async function onReady() {
  const dbid = await sqlite.open("p2pwdb-todo-example");
  await sqlite.exec(
    dbid,
    "CREATE TABLE IF NOT EXISTS todo (id, text, completed)"
  );
  sqlite.schemaChanged(dbid);

  startApp({
    dbid,
    sqlite,
  });

  window.onbeforeunload = () => {
    return sqlite.close(dbid);
  };
}

function startApp(ctx: {
  dbid: number;
  sqlite: Comlink.Remote<ComlinkableAPI>;
}) {
  (window as any).ctx = ctx;
  const root = createRoot(document.getElementById("container")!);
  root.render(<App ctx={ctx} />);
}

function onError(e: any) {
  console.error(e);
}

sqlite.onReady(Comlink.proxy(onReady), Comlink.proxy(onError));
