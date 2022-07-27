// @ts-ignore -- @types/better-sqlite3 is incorect on export
import Database from "better-sqlite3";
import { clock, Clock, queries } from "@cfsql/replicator";
import { Database as DB } from "better-sqlite3";
import * as fs from "fs";

export function open(file?: string): DB {
  const db = new Database(file ?? ":memory:") as DB;
  db.defaultSafeIntegers();
  return db;
}

export function q(db: DB, query: string, args?: any[]): any[] {
  args = args || [];
  return db.prepare(query).all(...args);
}

export function q0(db: DB, query: string, args?: any[]) {
  args = args || [];
  db.prepare(query).run(...args);
}

export function tables(db: DB) {
  return db.pragma("table_list");
}

export function tableInfo(db: DB, table: string) {
  return db.pragma(`table_info(${table})`);
}

/**
 * Marge the changes from the left to the right for the given table.
 * @param table
 * @param left
 * @param right
 */
export function sync(table: string, left: DB, right: DB) {
  const rightClock = clock.collapse(q(right, ...queries.currentClock(table)));
  const deltas = q(left, ...queries.deltas(table, "id", rightClock));

  q0(right, ...queries.patch(table, deltas));
}

/**
 * Figure out what deltas make left ahead of right for the given table.
 * @param table
 * @param left
 * @param right
 */
export function getDeltas(table: string, left: DB, right: DB): any[] {
  const rightClock = clock.collapse(q(right, ...queries.currentClock(table)));
  return q(left, ...queries.deltas(table, "id", rightClock));
}

/**
 * Compute the clock for `table` on db `db`
 * @param table
 * @param db
 * @returns
 */
export function getClock(table: string, db: DB): Clock {
  return clock.collapse(q(db, ...queries.currentClock(table)));
}

/**
 * Sets up the first ever cf db in-memory
 * @param file
 * @returns
 */
export function setupProtoDB(file?: string): DB {
  // { verbose: console.log }
  const db = new Database(file ?? ":memory:") as DB;

  db.defaultSafeIntegers();

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
