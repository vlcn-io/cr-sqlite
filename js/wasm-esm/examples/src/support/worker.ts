import sqliteWasm from "@vlcn.io/crsqlite-wasm";

sqliteWasm().then((sqlite3) => {
  const db = sqlite3.open("example-db", "c");

  db.execMany([
    "CREATE TABLE IF NOT EXISTS baz (a, b);",
    "INSERT INTO baz VALUES (1, 2);",
  ]);

  const rows = db.execA("SELECT * FROM baz");
  console.log(rows);

  db.close();
});
