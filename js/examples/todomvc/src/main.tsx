import * as React from "react";
import { createRoot } from "react-dom/client";

import sqliteWasm from "@vlcn.io/wa-crsqlite";
import startSync from "@vlcn.io/sync-client";
import tblrx from "@vlcn.io/rx-tbl";

// @ts-ignore
import wasmUrl from "@vlcn.io/wa-crsqlite/wa-sqlite-async.wasm?url";

type Ctx = {};

async function main() {
  const sqlite = await sqliteWasm(() => wasmUrl);

  const db = await sqlite.open("wdb-todomvc");
  (window as any).db = db;

  await db.exec(
    "CREATE TABLE IF NOT EXISTS todo (id primary key, text, completed)"
  );
  await db.exec("SELECT crsql_as_crr('todo')");

  window.onbeforeunload = () => {
    return db.close();
  };

  const rx = tblrx(db);
  // TODO:
  const sync = startSync({
    localDb: db,
    remoteDbId: "a0a36bfc-12da-4582-ae2e-928eaca0dc08",
    uri: "ws://localhost:8080/sync",
    create: {
      schemaName: "todo-mvc.sqlite",
    },
    rx,
  });
  const ctx = {
    db,
    sync,
    rx,
  };

  // startApp({
  //   db,
  //   siteid,
  //   rtc,
  //   rx,
  // });
}

function startApp(ctx: Ctx) {
  (window as any).ctx = ctx;
  const root = createRoot(document.getElementById("container")!);
  // root.render(<App ctx={ctx} />);
}

main();
