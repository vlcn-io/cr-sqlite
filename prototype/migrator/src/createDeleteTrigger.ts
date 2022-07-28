import { Database as DB } from "better-sqlite3";
import { TableInfo } from "./tableInfo";

export default function createDeleteTrigger(
  db: DB,
  tableName: string,
  columns: TableInfo
) {}
