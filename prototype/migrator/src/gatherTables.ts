import { Database as DB } from "better-sqlite3";

export default function gatherTables(db: DB, tables?: string[]): string[] {
  // The user provided a specific set to migrate? Just return that.
  if (Array.isArray(tables)) {
    return tables;
  }

  // else, gather everything on the src db
  return db
    .pragma("main.table_list")
    .map((t) => t.name)
    .filter((t) => t.indexOf("sqlite_") != 0);
}
