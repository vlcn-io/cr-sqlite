import { Database as DB } from "better-sqlite3";
import tableInfoFn from "./tableInfo.js";

// TODO: we can make this much smarter and faster
export default function copyData(src: DB, dest: DB, table: string) {
  console.log(`\tcopying ${table}`);
  const tableInfo = src.pragma(`table_info(${table})`);
  const pks = tableInfoFn.pks(tableInfo);

  let stmt: any;
  if (pks.length === 0) {
    // no primary key? We explicitly use rowid then.
    stmt = src.prepare(`SELECT rowid, * FROM "${table}"`);
  } else {
    stmt = src.prepare(`SELECT * FROM "${table}"`);
  }

  for (const row of stmt.iterate()) {
    const cols = Object.keys(row);
    dest
      .prepare(
        `INSERT INTO ${table} VALUES (${cols.map((c) => `:${c}`).join(", ")})`
      )
      .run(row);
  }
}
