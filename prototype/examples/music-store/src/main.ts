import SQLiteAsyncESMFactory from "wa-sqlite/dist/wa-sqlite-async.mjs";
import * as SQLite from "wa-sqlite";
import { IDBBatchAtomicVFS } from "./wa-sqlite/vfs/IDBBatchAtomicVFS.js";

async function hello() {
  const module = await SQLiteAsyncESMFactory({
    locateFile() {
      return "/wa-sqlite-async.wasm";
    },
  });
  const sqlite3 = SQLite.Factory(module);
  sqlite3.vfs_register(
    new IDBBatchAtomicVFS("idb-batch-atomic", { durability: "relaxed" })
  );

  const db = await sqlite3.open_v2(
    "music-store",
    SQLite.SQLITE_OPEN_CREATE |
      SQLite.SQLITE_OPEN_READWRITE |
      SQLite.SQLITE_OPEN_URI,
    "idb-batch-atomic"
  );

  const sql = tag(sqlite3, db);

  console.log(await sql`SELECT 'Hello, world!'`);
  // await sqlite3.exec(db, `SELECT 'Hello, world!'`, (row, columns) => {
  //   console.log(row);
  // });
  await sqlite3.close(db);
}

// from wa-sqlite demo -- https://github.com/rhashimoto/wa-sqlite/blob/66bc483115d8c5bb37abd5939cd51dd71f973998/src/examples/tag.js#L21
export function tag(sqlite3: SQLiteAPI, db: number) {
  return async function (strings: TemplateStringsArray, ...values) {
    // Assemble the template string components.
    const interleaved: string[] = [];
    strings.forEach((s, i) => {
      interleaved.push(s, values[i]);
    });
    const sql = interleaved.join("");

    // Loop over the SQL statements. sqlite3.statements is an API
    // convenience function (not in the C API) that iterates over
    // compiled statements, automatically managing resources.
    const results: { columns: string[]; rows: any[] }[] = [];
    for await (const stmt of sqlite3.statements(db, sql)) {
      const rows: any[] = [];
      const columns = sqlite3.column_names(stmt);
      while ((await sqlite3.step(stmt)) === SQLite.SQLITE_ROW) {
        // Collect row elements. sqlite3.row is an API convenience
        // function (not in the C API) that extracts values for all
        // the columns of the row.
        const row = sqlite3.row(stmt);
        rows.push(row);
      }
      if (columns.length) {
        results.push({ columns, rows });
      }
    }
    return results;
  };
}

hello();
