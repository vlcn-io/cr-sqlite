import { Database as DB } from "better-sqlite3";
import createInsertTrigger from "./insertTrigger.js";
import tableInfoFn, { TableInfo } from "./tableInfo.js";

export default function createTriggers(
  db: DB,
  tableName: string,
  columns: TableInfo
) {
  console.log("\tcreating insert trigger");
  createInsertTrigger(db, tableName, columns);

  console.log("\tcreating update trigger");

  console.log("\tcreating delete trigger");

  console.log("\tcreating patch trigger");
}
