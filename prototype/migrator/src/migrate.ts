import * as fs from "fs";
// @ts-ignore -- @types/better-sqlite3 is incorect on export
import Database from "better-sqlite3";
import { Database as DB } from "better-sqlite3";

/**
 * Migrate the source db file and write it to dest file.
 * Dest file will be overwritten!
 *
 * Optionally, provide a subset of tables to make conflict free rather
 * then making every table conflict free.
 *
 * @param sourceDbFile
 * @param destDbFile
 * @param tables
 */
export default function migrate(
  src: string,
  dest: string,
  tables?: string[],
  overwrite: boolean = false
) {
  if (fs.existsSync(dest)) {
    if (!overwrite) {
      throw {
        type: "invariant",
        msg: `${dest} already exists. Please remove it or re-run with the --overwrite option.`,
      };
    }
  }

  console.log(src, dest, tables, overwrite);
  const srcDb = new Database(src) as DB;
  const destDb = new Database(dest) as DB;
}
