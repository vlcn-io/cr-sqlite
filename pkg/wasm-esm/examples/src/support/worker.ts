// @ts-ignore
import sqliteWasm from "@vlcn.io/crsqlite-wasm";

sqliteWasm().then((sqlite3) => {
  const db = new sqlite3.opfs!.OpfsDb("example-db", "c");
  // const db = new sqlite3.oo1.DB(":memory:");

  db.exec([
    "CREATE TABLE IF NOT EXISTS baz (a, b);",
    "INSERT INTO baz VALUES (1, 2);",
  ]);

  let rows = [];
  db.exec({
    sql: "SELECT * FROM baz",
    resultRows: rows,
    rowMode: "object",
  });
  console.log(rows);

  db.exec("SELECT crsql_finalize()");
  db.close();
});
