import sqlite3InitModule from "./sqlite3.js";

/**
 * Create wrapper types for two reasons:
 * 1. Types (which we can get without wrappers)
 * 2. More ergonomic API(s)
 *
 * E.g., the base sqlite api requires passing row objects
 * that it'll then mutate and fill for you. A bit odd.
 */
export class SQLite3 {
  constructor(private baseSqlite3: any) {}

  /**
   *
   * @param filename undefined file name opens an in-memory database
   */
  open(filename?: string, mode: string = "c") {
    if (filename == null || filename === ":memory:") {
      return new DB(new this.baseSqlite3.oo1.DB());
    } else {
      return new DB(new this.baseSqlite3.opfs.OpfsDb(filename, mode));
    }
  }
}

export class DB {
  #closeListeners = new Set<() => void>();
  #inTx = false;

  constructor(private baseDb: any) {}

  exec(sql: string, bind?: unknown | unknown[]) {
    this.baseDb.exec(sql, {
      bind,
    });
  }

  /**
   * Returns rows as JSON objects.
   * I.e., column names are keys, column values are values
   * @param sql query to run
   * @param bind values, if any, to bind
   */
  execO(sql: string, bind?: unknown | unknown[]): { [key: string]: any }[] {
    return this.baseDb.exec(sql, {
      returnValue: "resultRows",
      rowMode: "object",
      bind,
    });
  }

  /**
   * Returns rows as arrays.
   * @param sql query to run
   * @param bind values, if any, to bind
   */
  execA(sql: string, bind?: unknown | unknown[]): any[] {
    return this.baseDb.exec(sql, {
      returnValue: "resultRows",
      rowMode: "array",
      bind,
    });
  }

  isOpen() {
    return this.baseDb.isOpen();
  }

  dbFilename() {
    return this.baseDb.dbFilename();
  }

  dbName() {
    return this.baseDb.dbName();
  }

  openStatementCount() {
    return this.baseDb.openStatementCount();
  }

  prepare(sql: string) {
    const stmt = this.baseDb.prepare(sql);
    return new Stmt(stmt);
  }

  close() {
    this.#closeListeners.forEach((l) => l());
    this.baseDb.exec("select crsql_finalize();");
    this.baseDb.close();
  }

  createFunction(name: string, fn: (...args: any) => unknown, opts?: {}) {
    this.baseDb.createFunction(name, fn, opts);
  }

  savepoint(cb: () => void) {
    this.baseDb.savepoint(cb);
  }

  transaction(cb: () => void) {
    if (this.#inTx) {
      this.savepoint(cb);
      return;
    }

    this.#inTx = true;
    try {
      this.baseDb.transaction(cb);
    } finally {
      this.#inTx = false;
    }
  }

  onClose(l: () => void) {
    this.#closeListeners.add(l);
  }

  removeOnClose(l: () => void) {
    this.#closeListeners.delete(l);
  }
}

export class Stmt {
  private mode: "col" | "obj" = "obj";
  constructor(private baseStmt: any) {}

  // wrap stmt in a better-sqlite3 like interface
  run(...bindArgs: any[]) {
    this.baseStmt.bind(bindArgs);
    while (this.baseStmt.step()) {}
  }

  get(...bindArgs: any[]): any[] {
    this.baseStmt.bind(bindArgs);
    if (this.baseStmt.step()) {
      return this.baseStmt.get(this.mode == "col" ? [] : {});
    } else {
      return [];
    }
  }

  all(...bindArgs: any[]) {
    this.baseStmt.bind(bindArgs);
    const ret: any[] = [];
    while (this.baseStmt.step()) {
      ret.push(this.baseStmt.get(this.mode == "col" ? [] : {}));
    }
    return ret;
  }

  *iterate(...bindArgs: any[]) {
    this.baseStmt.bind(bindArgs);
    while (this.baseStmt.step()) {
      yield this.baseStmt.get(this.mode == "col" ? [] : {});
    }
  }

  raw(isRaw: boolean = true) {
    if (isRaw) {
      this.mode = "col";
    } else {
      this.mode = "obj";
    }
  }

  bind(args: any[] | { [key: string]: any }) {
    this.baseStmt.bind(args);
  }

  finalize() {
    this.baseStmt.finalize();
  }
}

export default function initWasm(): Promise<SQLite3> {
  return sqlite3InitModule().then((baseSqlite3: any) => {
    return new SQLite3(baseSqlite3);
  });
}
