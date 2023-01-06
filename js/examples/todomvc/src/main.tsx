import * as React from "react";
import { createRoot } from "react-dom/client";

import sqliteWasm from "@vlcn.io/wa-crsqlite";
import startSync, { uuidStrToBytes } from "@vlcn.io/client-websocket";
import tblrx from "@vlcn.io/rx-tbl";

// @ts-ignore
import wasmUrl from "@vlcn.io/wa-crsqlite/wa-sqlite-async.wasm?url";
import { Ctx } from "./ctx";
import App from "./App";

async function main() {
  const sqlite = await sqliteWasm(() => wasmUrl);

  const db = await sqlite.open("wdb-todomvc-5");
  (window as any).db = db;

  await db.exec(
    "CREATE TABLE IF NOT EXISTS todo (id primary key, text, completed)"
  );
  await db.exec("SELECT crsql_as_crr('todo')");

  window.onbeforeunload = () => {
    return db.close();
  };

  const rx = tblrx(db);
  const sync = await startSync(`ws://${window.location.hostname}:8080/sync`, {
    localDb: db,
    // the id of the database to persist into on the server.
    // if a db with that id does not exist it can be created for you
    remoteDbId: uuidStrToBytes("a0a36bfc-12da-4582-ae2e-928eaca0dc08"),
    // the schema to apply to the db if it does not exist
    // TODO: validate that the opened db has the desired schema and version of that schema?
    create: {
      schemaName: "todo-mvc",
    },
    rx,
  });
  const ctx: Ctx = {
    db,
    sync,
    rx,
  };

  startApp(ctx);
}

function startApp(ctx: Ctx) {
  (window as any).ctx = ctx;
  const root = createRoot(document.getElementById("container")!);
  root.render(<App ctx={ctx} />);
}

main();
