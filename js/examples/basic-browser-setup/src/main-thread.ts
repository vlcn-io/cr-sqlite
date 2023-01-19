import sqliteWasm from "@vlcn.io/wa-crsqlite";
import { stringify as uuidStringify } from "uuid";

import wasmUrl from "@vlcn.io/wa-crsqlite/wa-sqlite-async.wasm?url";

async function run() {
  const sqlite = await sqliteWasm(() => wasmUrl);

  const db = await sqlite.open("main-thread-persist");

  // @ts-ignore
  window.db = db;
  let rows: any[] = [];

  await db.exec("CREATE TABLE IF NOT EXISTS foo (a primary key, b);");
  await db.exec("SELECT crsql_as_crr('foo');");
  await db.exec("INSERT OR IGNORE INTO foo VALUES (1, 2);");
  rows = await db.execA("select crsql_dbversion();");
  console.log("DB Version: ", rows[0][0]);
  rows = await db.execA("select crsql_siteid();");
  console.log("Site ID: ", uuidStringify(rows[0][0]));

  rows = await db.execA("select * from crsql_changes();");
  console.log("Changes: ", rows);

  rows = await db.execA("SELECT * FROM foo");
  console.log(rows[0]);

  await db.close();
}

run();
