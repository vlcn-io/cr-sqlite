import SQLiteAsyncESMFactory from "./crsqlite.mjs";
import * as SQLite from "@vlcn.io/wa-sqlite";
// @ts-ignore
import { IDBBatchAtomicVFS } from "@vlcn.io/wa-sqlite/src/examples/IDBBatchAtomicVFS.js";
import { serialize, topLevelMutex } from "./serialize.js";
import { DB } from "./DB.js";
export { DB } from "./DB.js";

let api: SQLite3 | null = null;
type SQLiteAPI = ReturnType<typeof SQLite.Factory>;

export class SQLite3 {
  constructor(private base: SQLiteAPI) {}

  open(filename?: string, mode: string = "c") {
    return serialize(
      null,
      undefined,
      () => {
        return this.base.open_v2(
          filename || ":memory:",
          SQLite.SQLITE_OPEN_CREATE |
            SQLite.SQLITE_OPEN_READWRITE |
            SQLite.SQLITE_OPEN_URI,
          filename != null ? "idb-batch-atomic" : undefined
        );
      },
      topLevelMutex
    ).then((db: any) => {
      const ret = new DB(this.base, db, filename || ":memory:");
      return ret.execA("select quote(crsql_site_id());").then((siteid) => {
        ret._setSiteid(siteid[0][0].replace(/'|X/g, ""));
        return ret;
      });
    });
  }
}

export default async function initWasm(
  locateWasm?: (file: string) => string
): Promise<SQLite3> {
  if (api != null) {
    return api;
  }

  const wasmModule = await SQLiteAsyncESMFactory({
    locateFile(file: string) {
      if (locateWasm) {
        return locateWasm(file);
      }
      return new URL("crsqlite.wasm", import.meta.url).href;
    },
  });
  const sqlite3 = SQLite.Factory(wasmModule);
  sqlite3.vfs_register(
    new IDBBatchAtomicVFS("idb-batch-atomic", { durability: "relaxed" })
  );

  api = new SQLite3(sqlite3);
  return api;
}
