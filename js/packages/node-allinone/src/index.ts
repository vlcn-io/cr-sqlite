// @ts-ignore
import Database from "better-sqlite3";
import { DB as IDB, Stmt as IStmt, UpdateType } from "@vlcn.io/xplat-api";
import { extensionPath } from "@vlcn.io/crsqlite";

const api = {
  open(filename?: string, mode: string = "c"): DB {
    return new DB(filename || ":memory:");
  },
};

export class DB implements IDB {
  private db: Database;
  private open: boolean;
  public readonly siteid: string;
  constructor(private filename: string) {
    this.db = new Database(filename);
    this.db.loadExtension(extensionPath);
    this.open = true;
    this.siteid = this.db
      .prepare("SELECT quote(crsql_site_id());")
      .raw()
      .get()[0]
      .replace(/'/g, "");
  }

  execMany(sql: string[]): void {
    this.db.exec(sql.join(";"));
  }

  exec(sql: string, bind?: unknown | unknown[]): void {
    if (Array.isArray(bind)) {
      this.db.prepare(sql).run(...bind);
    } else {
      this.db.prepare(sql).run();
    }
  }

  execO<T extends {}>(sql: string, bind?: unknown | unknown[]): T[] {
    if (Array.isArray(bind)) {
      return this.db.prepare(sql).all(...bind);
    } else {
      return this.db.prepare(sql).all();
    }
  }

  execA<T extends any[]>(sql: string, bind?: unknown | unknown[]): T[] {
    if (Array.isArray(bind)) {
      return this.db
        .prepare(sql)
        .raw()
        .all(...bind);
    } else {
      return this.db.prepare(sql).raw().all();
    }
  }

  onUpdate(
    cb: (
      type: UpdateType,
      dbName: string,
      tblName: string,
      rowid: bigint
    ) => void
  ): () => void {
    throw new Error("Update hook is not currently exposed by better-sqlite3");
  }

  isOpen() {
    return this.open;
  }

  dbFilename() {
    return this.filename;
  }

  openStatementCount() {
    return -1;
  }

  prepare(sql: string): IStmt {
    const ret = this.db.prepare(sql);
    // better-sqlite3 doesn't expose a finalize? hmm..
    ret.finalize = () => {};
    return ret;
  }

  createFunction(name: string, fn: (...args: any) => unknown) {
    this.db.function(name, fn);
  }

  savepoint(cb: () => void) {
    // better-sqlite3 auto makes a tx a savepoint if nested
    this.transaction(cb);
  }

  transaction(cb: () => void) {
    const cb2 = this.db.transaction(cb);
    const ret = cb2();
    if (typeof ret === "object" && typeof ret.then === "function") {
      console.warn(
        "better-sqlite3 should be used synchronously. Passing an async function to transaction will not behave as expected. See https://github.com/vlcn-io/cr-sqlite/issues/104"
      );
    }
    return ret;
  }

  close() {
    this.db.prepare("select crsql_finalize();").run();
    this.db.close();
    this.open = false;
  }
}

export default api;
