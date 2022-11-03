import sqlite3InitModule from './sqlite3.js';

/**
 * Create wrapper types for two reasons:
 * 1. Types (which we can get without wrappers)
 * 2. More ergonomic API(s)
 * 
 * E.g., the base sqlite api requires passing row objects
 * that it'll then mutate and fill for you. A bit odd.
 */
class Sqlite3 {
  constructor(private baseSqlite3: any) {
  }

  /**
   * 
   * @param filename undefined file name opens an in-memory database
   */
  open(filename?: string) {
    if (filename == null || filename === ":memory:") {
      return new DB(new this.baseSqlite3.DB());
    }
  }
}

class DB {
  constructor(private baseDb: any) {}

  /**
   * Returns rows as JSON objects.
   * I.e., column names are keys, column values are values
   * @param sql query to run
   * @param bindings values, if any, to bind
   */
  execO(sql: string, bindings?: unknown[]) {
    this.baseDb.exec(
      sql,
      {
        returnValue: "resultRows",
        rowMode: "object"
      }
    );
  }

  /**
   * Returns rows as arrays.
   * @param sql query to run
   * @param bindings values, if any, to bind
   */
  execA(sql: string, bindings?: unknown[]) {
    this.baseDb.exec(
      sql,
      {
        returnValue: "resultRows",
        rowMode: "array"
      }
    );
  }

  close() {
    this.baseDb.exec("select crsql_finalize();");
    this.baseDb.close();
  }
}

export default function initWasm(): Promise<Sqlite3> {
  return sqlite3InitModule().then((baseSqlite3: any) => {
    return new Sqlite3(baseSqlite3);
  })
}