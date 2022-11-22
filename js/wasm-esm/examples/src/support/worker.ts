import sqliteWasm from "@vlcn.io/wa-crsqlite";
import wasmUrl from "@vlcn.io/wa-crsqlite/wa-sqlite-async.wasm?url";

sqliteWasm((file) => wasmUrl).then(async (sqlite3) => {
  const db = await sqlite3.open("example-db", "c");

  await db.execMany([
    "CREATE TABLE IF NOT EXISTS baz (a, b);",
    "INSERT INTO baz VALUES (1, 2);",
  ]);

  const rows = await db.execA("SELECT * FROM baz");
  console.log(rows);

  await db.close();
});
