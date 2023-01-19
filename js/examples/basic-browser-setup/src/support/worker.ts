import sqliteWasm from "@vlcn.io/wa-crsqlite";
import wasmUrl from "@vlcn.io/wa-crsqlite/wa-sqlite-async.wasm?url";

sqliteWasm(() => wasmUrl).then(async (sqlite3) => {
  console.log(sqlite3);
  const db = await sqlite3.open("example-db-2");

  await db.execMany([
    "CREATE TABLE IF NOT EXISTS baz (a, b);",
    "INSERT INTO baz VALUES (1, 2);",
  ]);

  const rows = await db.execA("SELECT * FROM baz");
  console.log(rows);

  await db.close();
});
