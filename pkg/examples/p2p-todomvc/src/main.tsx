import * as React from "react";
import { createRoot } from "react-dom/client";
// @ts-ignore
import { stringify as uuidStringify } from "uuid";

import App from "./App";
import { Ctx } from "./hooks";
// import sqliteWasm, { DB, SQLite3 } from "@vlcn.io/crsqlite-wasm";
import sqliteWasm from "@vlcn.io/wa-crsqlite";
import tblrx from "@vlcn.io/rx-tbl";
import wdbRtc from "@vlcn.io/network-webrtc";

async function main() {
  const sqlite = await sqliteWasm();

  const db = await sqlite.open("p2p-wdb-todomvc");

  await db.exec("CREATE TABLE IF NOT EXISTS todo (id, text, completed)");
  // TODO wa-sqlite is retruning us the wrong array type!
  const r = await db.execA("SELECT crsql_siteid()");
  console.log(r);
  const siteid = uuidStringify(r[0][0]);

  const rx = await tblrx(db);
  const rtc = await wdbRtc(db);

  window.onbeforeunload = () => {
    return db.close();
  };

  startApp({
    db,
    siteid,
    rtc,
    rx,
  });
}

function startApp(ctx: Ctx) {
  (window as any).ctx = ctx;
  const root = createRoot(document.getElementById("container")!);
  root.render(<App ctx={ctx} />);
}

main();
