import * as Y from "yjs";
import { DB, DBAsync, Stmt, StmtAsync, PromiseQueue } from "@vlcn.io/xplat-api";
import { TblRx } from "@vlcn.io/rx-tbl";
// import { debounce } from "throttle-debounce";

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
type ConnStatus = "disconnected" | "connecting" | "connected";
export type Event =
  | boolean
  | {
      status: ConnStatus;
    }
  | Error;

export default class CrSqliteProvider {
  #doc;
  #db;
  #rx;
  #docid;
  #shouldConnect;
  #myWrites;
  #getChangesStmt: Stmt | StmtAsync | null = null;
  #insertChangesStmt: Stmt | StmtAsync | null = null;
  #lastDbVersion = 0n;
  #writing = false;
  #q;
  #connecting = false;
  #connected = false;
  #dispoables = new Set<() => void>();

  awareness = {
    localState: null,
    setLocalState(s: any) {
      this.localState = s;
    },
    getLocalState() {
      return this.localState;
    },
    on() {},
    off() {},
    getStates() {
      return [];
    },
  };

  #statusObservers = new Set<(s: { status: ConnStatus }) => void>();
  #syncObservers = new Set<(s: boolean) => void>();

  constructor(opts: Opts) {
    this.#doc = opts.doc;
    this.#db = opts.db;
    this.#rx = opts.rx;
    this.#docid = opts.docid;
    this.#q = new PromiseQueue();
    this.#myWrites = new Set<bigint>();

    if (opts.connect || opts.connect === undefined) {
      this.#shouldConnect = true;
      this.connect();
    }
  }

  get synced() {
    return this.#connected;
  }

  // The `ws` prefix on these method names is unfortunate.
  // it has nothing to do with websocket.
  // We mimick the websocket provider interface to make integrations
  // with existing tools easier. Those existing tools expect a websocket provider.
  get wsconnected() {
    return this.#connected;
  }

  get wsconnecting() {
    return this.#connecting;
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
    this.#connecting = true;
    this.#notifyStatusObservers("connecting");
    // connect to our db

    const startConnecting = () => {
      const ret = this.#db.execMany([
        `CREATE TABLE IF NOT EXISTS ydoc (
          doc_id TEXT,
          yhash BLOB,
          yval BLOB,
          primary key (doc_id, yhash)
        ) STRICT;`,
        `SELECT crsql_as_crr('ydoc');`,
      ]);

      this.#db._tag === "sync"
        ? afterCreateTables()
        : (ret as Promise<any>).then(() => afterCreateTables());
    };

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

      this.#dispoables.add(() => {
        this.#getChangesStmt?.finalize();
        this.#insertChangesStmt?.finalize();
      });

      if (this.#db._tag === "sync") {
        this.#dispoables.add(this.#rx.on(this.#dbChanged));
      } else {
        this.#dispoables.add(
          this.#rx.on((notif) => this.#q.add(() => this.#dbChanged(notif)))
        );
      }

      const maybePromise = this.#dbChanged(null);
      maybePromise == null
        ? finishConnection()
        : maybePromise.then(finishConnection);
    };

    const finishConnection = () => {
      this.#doc.on("update", this.#docUpdated);
      this.#doc.on("destroy", this.destroy);
      this.#dispoables.add(() => {
        this.#doc.off("update", this.#docUpdated);
        this.#doc.off("destroy", this.destroy);
      });
      this.#connecting = false;
      this.#connected = true;
      this.#notifyStatusObservers("connected");
      this.#notifySyncObservers(true);
    };

    startConnecting();
  }

  diconnect() {
    // do the thing
    this.#dispoables.forEach((d) => d());
    this.#dispoables.clear();
    this.#connected = false;
    this.#notifyStatusObservers("disconnected");
    this.#notifySyncObservers(false);
  }

  destroy() {
    this.diconnect();
    this.#clearAllObservers();
  }

  // contrary to what the yjs docs say is the behavior, `sync` is actually only fired once and not for every sync event received
  // for this and the actual `WebSocket` provider
  on(e: "sync", fn: (isSynced: boolean) => void): this;
  on(e: "status", fn: () => void): this;
  on(e: "connection-close", fn: () => void): this;
  on(e: "connection-error", fn: (err: Error) => void): this;
  on(e: EventType, cb: (e: any) => void): this {
    switch (e) {
      case "sync":
        this.#syncObservers.add(cb);
        break;
      case "status":
        this.#statusObservers.add(cb);
        break;
      case "connection-close":
        break;
      case "connection-error":
        break;
    }
    return this;
  }

  #dbChanged = (
    notif: Map<string, Set<bigint>> | null
  ): Promise<any> | null => {
    if (!this.#shouldProcessDbChange(notif)) {
      return null;
    }

    const start = () => {
      console.log("processing db change from ", this.#lastDbVersion);
      const maybeChanges = this.#getChangesStmt!.all(
        this.#docid,
        this.#lastDbVersion
      );

      return this.#getChangesStmt?._tag === "sync"
        ? afterGotChanges(maybeChanges as any[])
        : (maybeChanges as Promise<any>).then(afterGotChanges);
    };

    const afterGotChanges = (changes: any[]) => {
      // merge the changes into the doc
      Y.transact(
        this.#doc,
        () => {
          for (const c of changes) {
            Y.applyUpdate(this.#doc, c[0]);
            const asBigint = BigInt(c[1]);
            if (asBigint > this.#lastDbVersion) {
              this.#lastDbVersion = asBigint;
            }
          }
        },
        this,
        false
      );

      return null;
    };

    return start();
  };

  #docUpdated = async (update: Uint8Array, origin: any) => {
    if (origin == this) {
      // change from our db, no need to save it to the db
      return;
    }
    const yhash = await crypto.subtle.digest("SHA-1", update);

    // write to db
    // note: we may want to debounce this? no need to save immediately after every keystroke.
    if (this.#db._tag === "sync") {
      this.#writing = true;
      let insertRet;
      try {
        insertRet = this.#insertChangesStmt!.get(
          this.#docid,
          new Uint8Array(yhash),
          update
        );
      } finally {
        this.#writing = false;
      }
      this.#myWrites.add(BigInt(insertRet[0]));
      this.#capWriteTrackerSize();
    } else {
      this.#q.add(async () => {
        const insertRet = await this.#insertChangesStmt!.get(
          this.#docid,
          new Uint8Array(yhash),
          update
        );
        this.#myWrites.add(BigInt(insertRet[0]));
        this.#capWriteTrackerSize();
      });
    }
  };

  // this should never happen but.. in case it does for
  // some odd reason.
  #capWriteTrackerSize() {
    if (this.#myWrites.size >= 500) {
      console.warn("unexpected leaked write records");
      let i = 0;
      for (const entry of this.#myWrites) {
        if (i < 400) {
          this.#myWrites.delete(entry);
        } else {
          break;
        }
      }
    }
  }

  #shouldProcessDbChange(notif: Map<string, Set<bigint>> | null) {
    if (notif == null) {
      return true;
    }

    if (this.#writing) {
      console.log("called back while writing");
      return false;
    }

    const rowids = notif.get("ydoc");
    if (rowids == null) {
      // our table did not change
      // nothing to do
      return false;
    }

    // did the update contain an rid that we did not write?
    let ret = false;
    for (const rid of rowids) {
      if (!this.#myWrites.has(rid)) {
        // we could early return but we want to clear
        // our myWrites set
        ret = true;
      } else {
        this.#myWrites.delete(rid);
      }
    }

    return ret;
  }

  #notifyStatusObservers(status: ConnStatus) {
    this.#statusObservers.forEach((fn) => fn({ status }));
  }

  #notifySyncObservers(synced: boolean) {
    this.#syncObservers.forEach((fn) => fn(synced));
  }

  #clearAllObservers() {
    this.#syncObservers.clear();
    this.#statusObservers.clear();
  }
}
