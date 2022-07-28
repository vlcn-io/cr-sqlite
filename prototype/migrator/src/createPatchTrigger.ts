import { Database as DB } from "better-sqlite3";
import { TableInfo } from "./tableInfo";

export default function createPatchTrigger(
  db: DB,
  tableName: string,
  columns: TableInfo
) {}
