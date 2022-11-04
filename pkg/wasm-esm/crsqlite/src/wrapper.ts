import sqlite3InitModule from './sqlite3.js';

/**
 * Create wrapper types for two reasons:
 * 1. Types (which we can get without wrappers)
 * 2. More ergonomic API(s)
 * 
 * E.g., the base sqlite api requires passing row objects
 * that it'll then mutate and fill for you. A bit odd.
 */
export class SQLite3 {
  constructor(private baseSqlite3: any) {
  }

  /**
   * 
   * @param filename undefined file name opens an in-memory database
   */
  open(filename?: string, mode: string = 'c') {
    if (filename == null || filename === ":memory:") {
      return new DB(new this.baseSqlite3.oo1.DB());
    } else {
      return new DB(new this.baseSqlite3.opfs.OpfsDb(filename, mode));
    }
  }
}

export type Stringish = string | string[];

export class DB {
  #closeListeners = new Set<() => void>();

  constructor(private baseDb: any) {}

  exec(sql: Stringish, bind?: unknown | unknown[]) {
    this.baseDb.exec(
      sql,
      {
        bind,
      }
    );
  }

  /**
   * Returns rows as JSON objects.
   * I.e., column names are keys, column values are values
   * @param sql query to run
   * @param bind values, if any, to bind
   */
  execO(sql: Stringish, bind?: unknown | unknown[]): {[key: string]: any}[] {
    return this.baseDb.exec(
      sql,
      {
        returnValue: "resultRows",
        rowMode: "object",
        bind,
      }
    );
  }

  /**
   * Returns rows as arrays.
   * @param sql query to run
   * @param bind values, if any, to bind
   */
  execA(sql: Stringish, bind?: unknown | unknown[]): any[] {
    return this.baseDb.exec(
      sql,
      {
        returnValue: "resultRows",
        rowMode: "array",
        bind,
      }
    );
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

  // TODO: hopefully we don't have to wrap this too for sensible defaults
  prepare(sql: string) {
    return this.baseDb.prepare(sql);
  }

  close() {
    this.#closeListeners.forEach(l => l());
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
    this.baseDb.transaction(cb);
  }

  onClose(l: () => void) {
    this.#closeListeners.add(l);
  }

  removeOnClose(l: () => void) {
    this.#closeListeners.delete(l);
  }
}

export default function initWasm(): Promise<SQLite3> {
  return sqlite3InitModule().then((baseSqlite3: any) => {
    return new SQLite3(baseSqlite3);
  })
}