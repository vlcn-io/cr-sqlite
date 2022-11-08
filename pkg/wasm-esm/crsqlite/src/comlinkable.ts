import sqliteWasm, { SQLite3, DB } from "./wrapper.js";

const promise = sqliteWasm();

let sqlite3: SQLite3 | null;
promise.then((s) => (sqlite3 = s));
let dbid = 0;

export type DBID = number;

const dbs = new Map<DBID, DB>();
const api = {
  onReady(cb: () => void, err: (e: any) => void) {
    promise.then(
      () => cb(),
      (e) => err(e)
    );
  },

  open(file?: string, mode: string = "c"): DBID {
    const db = sqlite3!.open(file, mode);
    // appl extensions
    dbs.set(++dbid, db);
    return dbid;
  },

  exec(dbid: DBID, sql: string, bind?: unknown[]) {
    const db = dbs.get(dbid);
    db!.exec(sql, bind);
  },

  execMany(dbid: DBID, sql: string[]) {
    const db = dbs.get(dbid);
    db!.execMany(sql);
  },

  execO(dbid: DBID, sql: string, bind?: unknown[]) {
    const db = dbs.get(dbid);
    return db!.execO(sql, bind);
  },

  execA(dbid: DBID, sql: string, bind?: unknown[]) {
    const db = dbs.get(dbid);
    return db!.execA(sql, bind);
  },

  isOpen(dbid: DBID) {
    const db = dbs.get(dbid);
    return db!.isOpen();
  },

  dbFilename(dbid: DBID) {
    const db = dbs.get(dbid);
    return db!.dbFilename();
  },

  dbName(dbid: DBID) {
    const db = dbs.get(dbid);
    return db!.dbName();
  },

  openStatementCount(dbid: DBID) {
    const db = dbs.get(dbid);
    return db!.openStatementCount();
  },

  savepoint(dbid: DBID, cb: () => void) {
    const db = dbs.get(dbid);
    db!.savepoint(cb);
  },

  transaction(dbid: DBID, cb: () => void) {
    const db = dbs.get(dbid);
    db!.transaction(cb);
  },

  close(dbid: DBID) {
    const db = dbs.get(dbid);
    dbs.delete(dbid);
    // kill registered db extensions
    db!.close();
  },

  // TODO: we can provide a prepared statement API too
} as const;

export type API = typeof api;
export default api;

export function registerDbExtension(ext: (dbid: DBID, db: DB) => () => void) {
  // Will call `ext` any time a new db is opened.
  // If ext returns a function, will call that whenever the db is closed.
}
