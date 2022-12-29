import * as Y from "yjs";
import { DB, DBAsync, Stmt, StmtAsync, PromiseQueue } from "@vlcn.io/xplat-api";
import { TblRx } from "@vlcn.io/rx-tbl";

/**
 * lexical assumes that the only yjs provider is a websocket provider.
 *
 * We thus need to conform to the websocket provider interface for a seamless
 * lexical integration.
 *
 * This likely makes other integrations easier as well given that the websocket
 * provider has been around for some time.
 */

export type Opts = {
  db: DB | DBAsync;
  rx: TblRx;
  docid: string;
  doc: Y.Doc;

  connect?: boolean;
};
export type EventType =
  | "sync"
  | "status"
  | "connection-close"
  | "connection-error";
export type Event = boolean | {} | Error;

export default class CrSqliteProvider {
  #doc;
  #db;
  #rx;
  #shouldConnect;
  #getChangesStmt: Stmt | StmtAsync | null = null;
  #insertChangesStmt: Stmt | StmtAsync | null = null;

  constructor(opts: Opts) {
    this.#doc = opts.doc;
    this.#db = opts.db;
    this.#rx = opts.rx;

    if (opts.connect || opts.connect === undefined) {
      this.#shouldConnect = true;
      this.connect();
    }
  }

  get synced() {
    return true;
  }

  // The `ws` prefix on these method names is unfortunate.
  // it has nothing to do with websocket.
  // We mimick the websocket provider interface to make integrations
  // with existing tools easier. Those existing tools expect a websocket provider.
  get wsconnected() {
    return true;
  }

  get wsconnecting() {
    return false;
  }

  get shouldConnect() {
    return this.#shouldConnect;
  }

  get bcconnected() {
    return true;
  }

  connect() {
    if (this.wsconnecting) {
      return;
    }
    // connect to our db
    let ret = this.#db.execMany([
      `CREATE TABLE IF NOT EXISTS ydoc (
        doc_id TEXT,
        yhash BLOB,
        yval BLOB,
        primary key (doc_id, yhash)
      ) STRICT;`,
      `SELECT crsql_as_crr('ydoc');`,
    ]);

    const afterCreateTables = () => {
      let maybeGetChangesStmt = this.#db.prepare(
        `SELECT ydoc.yval, clock.__crsql_db_version FROM
        ydoc__crsql_clock as clock JOIN ydoc ON
          ydoc.doc_id = clock.doc_id AND
          ydoc.yhash = clock.yhash
      WHERE clock.doc_id = ? AND clock.__crsql_db_version > ?`
      );
      let maybeInsertChangesStmt = this.#db.prepare(
        `INSERT INTO ydoc (doc_id, yhash, yval) VALUES (?, ?, ?) RETURNING rowid`
      );

      this.#db._tag === "sync"
        ? afterPrepareStmts(
            maybeGetChangesStmt as Stmt,
            maybeInsertChangesStmt as Stmt
          )
        : Promise.all([maybeGetChangesStmt, maybeInsertChangesStmt]).then(
            ([getChangesStmt, insertCangesStmt]) =>
              afterPrepareStmts(getChangesStmt, insertCangesStmt)
          );
    };

    const afterPrepareStmts = (
      getChangesStmt: Stmt | StmtAsync,
      insertCangesStmt: Stmt | StmtAsync
    ) => {
      this.#getChangesStmt = getChangesStmt;
      this.#insertChangesStmt = insertCangesStmt;

      // this.#rx.on(this.#onDbCahnge);
    };

    this.#db._tag === "sync"
      ? afterCreateTables()
      : (ret as Promise<any>).then(() => afterCreateTables());
  }

  diconnect() {}

  destroy() {}

  on(e: "sync", fn: (isSynced: boolean) => void): this;
  on(e: "status", fn: () => void): this;
  on(e: "connection-close", fn: () => void): this;
  on(e: "connection-error", fn: (err: Error) => void): this;
  on(e: EventType, cb: (e: any) => void): this {
    return this;
  }
}
