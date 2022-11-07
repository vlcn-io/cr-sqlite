import sqliteWasm, { SQLite3, DB } from "./wrapper.js";
import * as Comlink from "comlink";

const promise = sqliteWasm();

let sqlite3: SQLite3 | null;
promise.then((s) => (sqlite3 = s));

let db: DB | null = null;

const api = {
  onReady(cb: () => void, err: (e: any) => void) {
    promise.then(
      () => cb(),
      (e) => err(e)
    );
  },

  open(file?: string, mode: string = "c") {
    if (db != null) {
      throw new Error("Only 1 db per worker is supported");
    }
    db = sqlite3!.open(file, mode);
  },

  exec(sql: string, bind?: unknown[]) {
    db!.exec(sql, bind);
  },

  execMany(sql: string[]) {
    db!.execMany(sql);
  },

  execO(sql: string, bind?: unknown[]) {
    return db!.execO(sql, bind);
  },

  execA(sql: string, bind?: unknown[]) {
    return db!.execA(sql, bind);
  },

  isOpen() {
    return db!.isOpen();
  },

  dbFilename() {
    return db!.dbFilename();
  },

  dbName() {
    return db!.dbName();
  },

  openStatementCount() {
    return db!.openStatementCount();
  },

  savepoint(cb: () => void) {
    db!.savepoint(cb);
  },

  transaction(cb: () => void) {
    db!.transaction(cb);
  },

  close() {
    db!.close();
  },
} as const;

export type API = typeof api;

Comlink.expose(api);
