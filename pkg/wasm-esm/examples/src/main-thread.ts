// @ts-ignore
import sqliteWasm from "@vlcn/crsqlite-wasm";
import { Uuid } from "uuid-tool";

console.log(sqliteWasm);

const sqlite = await sqliteWasm();

const db = new sqlite.oo1.DB(":memory:");

// @ts-ignore
window.db = db;
let rows = [];

db.exec("CREATE TABLE foo (a primary key, b);");
db.exec("SELECT crsql_as_crr('foo');");
db.exec("INSERT INTO foo VALUES (1, 2);");
db.exec("select crsql_dbversion();", { resultRows: rows });
console.log("DB Version: ", rows[0][0]);
rows = [];
db.exec("select crsql_siteid();", { resultRows: rows });
console.log("Site ID: ", new Uuid(rows[0][0]).toString());

rows = [];
db.exec("select * from crsql_changes();", { resultRows: rows });
console.log("Changes: ", rows);

rows = [];
db.exec({
  sql: "SELECT * FROM foo",
  resultRows: rows,
  rowMode: "object",
});
console.log(rows[0]);

// you _MUST_ run this before closing `crsql` db connections
// see -- https://sqlite.org/forum/forumpost/a38be46f01
db.exec("SELECT crsql_finalize()");
db.close();

// Spawning into a worker
console.log("Try running the db in a worker");
new Worker(new URL("./crsqlite-worker.ts", import.meta.url), {
  type: "module",
});
