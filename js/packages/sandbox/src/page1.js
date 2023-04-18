import wasm from "@vlcn.io/crsqlite-wasm";
import wasmUrl from "@vlcn.io/crsqlite-wasm/crsqlite.wasm?url";

async function start() {
  const sqlite = await wasm(() => wasmUrl);
  const db = await sqlite.open("tst.db");
  await db.execMany([
    `DROP TABLE IF EXISTS items;`,
    `DROP TABLE IF EXISTS items__crsql_clock;`,
    `CREATE TABLE IF NOT EXISTS items (
      "id" TEXT PRIMARY KEY,
      "data" TEXT
    );`,
    `SELECT crsql_as_crr('items');`,
  ]);

  const data = ["site", "data", "'some data'", "items", "'12345'", 1, 1];
  await db.exec(
    `INSERT INTO crsql_changes("site_id","cid","pk","table","val","db_version","col_version") VALUES (?,?,?,?,?,?,?)`,
    data
  );
}

start();

// TODO:
// - Does it happen in nodejs? Or the CLI when pointed at same file?
// - Does it happen in Python?
// - Is it an issue with the merge code and an error path?
// - Does it happen with other virtual table insertions?
// - Does it happen with different wa-sqlite concurrency mode?

// This line fixes the lock
// console.log(await db.execO(`SELECT * FROM items`));
