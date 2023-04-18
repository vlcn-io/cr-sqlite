import SQLiteDB from "better-sqlite3";

// the crsqlite package exports the path to the extension
import { extensionPath } from "@vlcn.io/crsqlite";

const db = new SQLiteDB("f.db");
// suggested settings for best performance of sqlite
// db.pragma("journal_mode = WAL");
// db.pragma("synchronous = NORMAL");
// load that extension with the `better-sqlite3` bindings
db.loadExtension(extensionPath);

db.exec(`DROP TABLE IF EXISTS items;`);
db.exec(`DROP TABLE IF EXISTS items__crsql_clock;`);
db.exec(`CREATE TABLE IF NOT EXISTS items (
  "id" TEXT PRIMARY KEY,
  "data" TEXT
);`);
db.exec(`SELECT crsql_as_crr('items');`);

const data = ["site", "data", "'some data'", "items", "'12345'", 1, 1];
const stmt = db.prepare(
  `INSERT INTO crsql_changes("site_id","cid","pk","table","val","db_version","col_version") VALUES (?,?,?,?,?,?,?)`
);
stmt.bind(...data);

stmt.run();

// await sleep(30000);

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

console.log(db.prepare("SELECT * FROM items").all());
console.log("THIS IS NEVER REACHED!");
