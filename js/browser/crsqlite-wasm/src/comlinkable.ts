import sqliteWasm, { SQLite3, DB } from "./wrapper.js";

let promise: Promise<SQLite3> | null = null;
let sqlite3: SQLite3 | null = null;
let dbid = 0;

export type DBID = number;

const dbs = new Map<DBID, DB>();
const extensions = new Set<(dbid: DBID, db: DB) => () => void>();
const extensionTearDowns = new Map<DBID, (() => void)[]>();

export interface ComlinkableAPI {
  onReady(
    urls: {
      wasmUrl: string;
      proxyUrl: string;
    },
    cb: () => void,
    err: (e: any) => void
  ): void;

  open(file?: string, mode?: string): DBID;

  exec(dbid: DBID, sql: string, bind?: unknown[]): void;

  execMany(dbid: DBID, sql: string[]): void;

  execO<T extends {}>(dbid: DBID, sql: string, bind?: unknown[]): T[];

  execA<T extends any[]>(dbid: DBID, sql: string, bind?: unknown[]): T[];

  isOpen(dbid: DBID): boolean;

  dbFilename(dbid: DBID): string;

  dbName(dbid: DBID): string;

  openStatementCount(dbid: DBID): number;

  savepoint(dbid: DBID, cb: () => void): void;

  transaction(dbid: DBID, cb: () => void): void;

  close(dbid: DBID): void;
}

const api = {
  onReady(
    urls: {
      wasmUrl: string;
      proxyUrl: string;
    },
    cb: () => void,
    err: (e: any) => void
  ) {
    if (promise == null) {
      promise = sqliteWasm({
        locateWasm: () => urls.wasmUrl,
        locateProxy: () => urls.proxyUrl,
      }).then((s) => (sqlite3 = s));
    }
    promise.then(
      () => cb(),
      (e) => err(e)
    );
  },

  open(file?: string, mode: string = "c"): DBID {
    if (promise == null) {
      throw new Error(
        "You must await initialization by calling `onReady` first"
      );
    }
    const db = sqlite3!.open(file, mode);
    // appl extensions
    dbs.set(++dbid, db);

    const teardowns = [];
    for (const ext of extensions) {
      teardowns.push(ext(dbid, db));
    }
    extensionTearDowns.set(dbid, teardowns);

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
    const teardowns = extensionTearDowns.get(dbid);
    teardowns?.forEach((t) => t());
    extensionTearDowns.delete(dbid);
    db!.close();
  },

  // TODO: we can provide a prepared statement API too
} as ComlinkableAPI;

export type API = ComlinkableAPI;
export default api;

export function registerDbExtension(ext: (dbid: DBID, db: DB) => () => void) {
  // Will call `ext` any time a new db is opened.
  // If ext returns a function, will call that whenever the db is closed.
  extensions.add(ext);
}
