import { Database as DB } from "better-sqlite3";
import createDeleteTrigger from "./createDeleteTrigger.js";
import createPatchTrigger from "./createPatchTrigger.js";
import createUpdateTrigger from "./createUpdateTrigger.js";
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
  createUpdateTrigger(db, tableName, columns);

  console.log("\tcreating delete trigger");
  createDeleteTrigger(db, tableName, columns);

  console.log("\tcreating patch trigger");
  createPatchTrigger(db, tableName, columns);
}
