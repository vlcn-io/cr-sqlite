// @ts-ignore -- @types/better-sqlite3 is incorect on export
import Database from "better-sqlite3";
import { Database as DB } from "better-sqlite3";
import * as fs from "fs";

export default function setupDb(file?: string): DB {
  // { verbose: console.log }
  const db = new Database(file ?? ":memory:") as DB;

  runfile(db, "crr_db_version.sqlite.sql");
  runfile(db, "crr_site_id.sqlite.sql");
  runfile(db, "prime_version.sqlite.sql");
  runfile(db, "prime_site_id.sqlite.sql");
  runfile(db, "todo_crr.sqlite.sql");
  runfile(db, "todo_view.sqlite.sql");
  runfile(db, "insert_todo_trig.sqlite.sql");
  runfile(db, "update_todo_trig.sqlite.sql");
  runfile(db, "delete_todo_trig.sqlite.sql");
  runfile(db, "todo_patch.sqlite.sql");
  runfile(db, "insert_todo_patch.sqlite.sql");
  runfile(db, "todo_crr_clocks.sqlite.sql");

  return db;
}

function runfile(db: DB, file: string) {
  // console.log('Running: ' + file);
  const contents = fs.readFileSync("../test-schemas/" + file, {
    encoding: "utf8",
  });
  db.prepare(contents).run();
}
