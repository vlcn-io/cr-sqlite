import sqliteWasm, { SQLite3, DB, Stmt } from "./wrapper.js";
// import "./transfer-handlers";

let promise: Promise<SQLite3> | null = null;
let sqlite3: SQLite3 | null = null;
let dbid = 0;
let stmtid = 0;

export type DBID = number;
export type StmtID = number;

const dbs = new Map<DBID, DB>();
const stmts = new Map<StmtID, Stmt>();
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

  prepare(dbid: DBID, sql: string): StmtID;

  stmtRun(stmtid: StmtID, bind: any[]): void;

  stmtGet(stmtid: StmtID, mode: "o" | "a", bind: any[]): [string[], any[]];

  stmtAll(stmtid: StmtID, mode: "o" | "a", bind: any[]): [string[], any[][]];

  // https://blog.scottlogic.com/2020/04/22/Async-Iterators-Across-Execution-Contexts.html
  // stmtIterate<T>(stmtid: StmtID, mode: "o" | "a", bind: any[]): Iterator<T>;

  stmtRaw(isRaw?: boolean | undefined): void;

  stmtFinalize(stmtid: StmtID): void;
}

const api: ComlinkableAPI = {
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

  // TODO: do not expose since we should not do conversions on this
  // side of the worker boundary
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

  prepare(dbid: DBID, sql: string) {
    const db = dbs.get(dbid);
    const stmt = db!.prepare(sql);
    let id = ++stmtid;
    stmts.set(id, stmt);
    return id;
  },

  close(dbid: DBID) {
    const db = dbs.get(dbid);
    dbs.delete(dbid);
    const teardowns = extensionTearDowns.get(dbid);
    teardowns?.forEach((t) => t());
    extensionTearDowns.delete(dbid);
    db!.close();
  },

  stmtRun(stmtid: StmtID, bind: any[]): void {
    const stmt = stmts.get(stmtid);
    stmt!.run(bind);
  },

  stmtGet(stmtid: StmtID, mode: "o" | "a", bind: any[]): any {
    const stmt = stmts.get(stmtid);
    if (mode === "a") {
      stmt?.raw(true);
    }
    return stmt!.get(bind);
  },

  stmtAll(stmtid: StmtID, mode: "o" | "a", bind: any[]): any {
    const stmt = stmts.get(stmtid);
    if (mode === "a") {
      stmt?.raw(true);
    }
    return stmt!.all(bind);
  },

  // stmtIterate<T>(stmtid: StmtID, mode: "o" | "a", bind: any[]): Iterator<T> {
  //   const stmt = stmts.get(stmtid);
  //   if (mode === "a") {
  //     stmt?.raw(true);
  //   }
  //   return stmt!.iterate(bind);
  // },

  stmtRaw(isRaw?: boolean | undefined): void {},

  stmtFinalize(stmtid: StmtID): void {
    const stmt = stmts.get(stmtid);
    stmt!.finalize();
  },

  // TODO: we can provide a prepared statement API too
};

export type API = ComlinkableAPI;
export default api;

export function registerDbExtension(ext: (dbid: DBID, db: DB) => () => void) {
  // Will call `ext` any time a new db is opened.
  // If ext returns a function, will call that whenever the db is closed.
  extensions.add(ext);
}
