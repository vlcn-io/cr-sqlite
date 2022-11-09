import * as React from "react";
import { createRoot } from "react-dom/client";
import { stringify as uuidStringify } from "uuid";

import App from "./App";
import { Ctx } from "./hooks";
import sqliteWasm, { DB, SQLite3 } from "@vlcn.io/crsqlite-wasm";
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

  const dirname = sqlite.baseSqlite3.sqlite3_wasmfs_opfs_dir();
  let db: DB = dirname
    ? sqlite.open(dirname + "/p2p-todomvc-wdb.db")
    : sqlite.open("file:local?vfs=kvvs");

  db.exec("CREATE TABLE IF NOT EXISTS todo (id, text, completed)");
  const siteid = uuidStringify(db.execA("SELECT crsql_siteid()")[0][0]);

  const rx = tblrx(db);
  const rtc = wdbRtc(db);

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
