import SQLiteAsyncESMFactory from "./wa-sqlite-async.js";
import * as SQLite from "wa-sqlite";
// @ts-ignore
import { IDBBatchAtomicVFS } from "wa-sqlite/src/examples/IDBBatchAtomicVFS.js";
import { DB as IDB, Stmt as IStmt } from "@vlcn.io/xplat-api";

let api: SQLiteAPI | null = null;

export class SQLite3 {
  constructor(private base: SQLiteAPI) {}

  open(filename?: string, mode: string = "c") {
    return this.base
      .open_v2(
        filename || ":memory:",
        SQLite.SQLITE_OPEN_CREATE |
          SQLite.SQLITE_OPEN_READWRITE |
          SQLite.SQLITE_OPEN_URI,
        filename != null ? "idb-batch-atomic" : undefined
      )
      .then((db) => new DB(this.base, db));
  }
}

export class DB {
  //implements IDB {
  constructor(public api: SQLiteAPI, public db: number) {}

  // execMany(sql: string[]): void {
  //   await this.api.exec(this.db, sql.join(""));
  // }

  // exec(sql: string, bind?: unknown | unknown[]): void {}
  // execO<T extends {}>(sql: string, bind?: unknown | unknown[]): T[] {}
  // execA<T extends any[]>(sql: string, bind?: unknown | unknown[]): T[] {}

  // prepare(sql: string): Stmt {}
  // close(): void {}
  // createFunction(
  //   name: string,
  //   fn: (...args: any) => unknown,
  //   opts?: {}
  // ): void {}
  // savepoint(cb: () => void): void {}
  // transaction(cb: () => void): void {}
}

export default async function initWasm(): Promise<SQLiteAPI> {
  if (api != null) {
    return api;
  }

  console.log("loc");
  const module = await SQLiteAsyncESMFactory({
    locateFile(file: string) {
      return new URL(file, import.meta.url).href;
    },
  });
  console.log("fac");
  const sqlite3 = SQLite.Factory(module);
  console.log("reg");
  sqlite3.vfs_register(
    new IDBBatchAtomicVFS("idb-batch-atomic", { durability: "relaxed" })
  );
  console.log("registered");

  return sqlite3;
}
