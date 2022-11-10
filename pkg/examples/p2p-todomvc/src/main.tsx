import * as React from "react";
import { createRoot } from "react-dom/client";
import { stringify as uuidStringify } from "uuid";

import App from "./App";
import { Ctx } from "./hooks";
// import sqliteWasm, { DB, SQLite3 } from "@vlcn.io/crsqlite-wasm";
import sqliteWasm from "@vlcn.io/wa-crsqlite";
import tblrx from "@vlcn.io/rx-tbl";
import wdbRtc from "@vlcn.io/network-webrtc";

/*
try dis:
const dirName = sqlite3.capi.sqlite3_wasmfs_opfs_dir()
if( dirName ) { ... OPFS is active ... }
else { ... OPFS is not available ... }

then dis:
file:local?vfs=kvvs
*/

async function main() {
  const sqlite = await sqliteWasm();

  const db = await sqlite.open("p2p-wdb-todomvc");

  await db.exec("CREATE TABLE IF NOT EXISTS todo (id, text, completed)");
  const r = await db.execA("SELECT crsql_siteid()");
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
