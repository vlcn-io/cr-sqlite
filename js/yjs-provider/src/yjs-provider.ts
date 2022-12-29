import * as Y from "yjs";
import { DB, DBAsync, Stmt, StmtAsync, PromiseQueue } from "@vlcn.io/xplat-api";
import { TblRx } from "@vlcn.io/rx-tbl";

export interface YjsProvider {
  dispose(): void;
}

/**
 * This is a super simple `yjs` provider for `crsqlite` to test the waters.
 * The points where we can improve:
 * - store decoded doc structure in the table, not byte arrays
 * - give special treatment so we don't duplicate clock information
 *  This shoves yjs state into a crsqlite LWW, creating duplicative clock information and
 *  duplicative copies of `yjs` update primary keys.
 */
class Provider implements YjsProvider {
  #doc;
  #db;
  #rx;
  #getChangesStmt: Stmt | StmtAsync | null = null;
  #insertChangesStmt: Stmt | StmtAsync | null = null;
  #lastDbVersion = 0;
  #docid;
  #myApplications;
  #inflightInsert: Promise<any> | null = null;
  #q;

  constructor(db: DB | DBAsync, rx: TblRx, docid: string, doc: Y.Doc) {
    this.#doc = doc;
    this.#db = db;
    this.#rx = rx;
    this.#docid = docid;
    this.#myApplications = new Set<bigint>();
    this.#q = new PromiseQueue();
    // TODO: listen for DB updates to merge back into the doc
    // via tblrx.
    // What rows do we want?
    // - rows from ydoc table where clock > last pulled clock and doc_id = our doc id
  }

  async init() {
    [this.#getChangesStmt, this.#insertChangesStmt] = await Promise.all([
      this.#db.prepare(
        `SELECT ydoc.yval, clock.__crsql_db_version FROM
        ydoc__crsql_clock as clock JOIN ydoc ON
          ydoc.doc_id = clock.doc_id AND
          ydoc.yhash = clock.yhash
      WHERE clock.doc_id = ? AND clock.__crsql_db_version > ?`
      ),
      this.#db.prepare(
        `INSERT INTO ydoc (doc_id, yhash, yval) VALUES (?, ?, ?) RETURNING rowid`
      ),
    ]);

    // observe before populating doc in case changes
    // come in while populating doc, those updates will be queued
    // to be applied.
    this.#rx.on((notif: Map<string, Set<bigint>>) =>
      this.#q.add(() => this.#dbChanged(notif))
    );

    // populate doc
    await this.#dbChanged(null);

    // now listen to doc to write changes back to db on doc change.
    this.#doc.on("update", this.#docUpdated);
    this.#doc.on("destroy", this.dispose);
  }

  dispose = () => {
    this.#getChangesStmt?.finalize();
    this.#insertChangesStmt?.finalize();
  };

  #docUpdated = async (update: Uint8Array, origin: any) => {
    if (origin == this) {
      // change from our db, no need to save it to the db
      return;
    }
    console.log("processing doc update");
    const yhash = await crypto.subtle.digest("SHA-1", update);

    // q: will we get a notification before we get
    // a return value? lol maybe

    // write to db
    // note: we may want to debounce this? no need to save immediately after every keystroke.
    // need to promise quuee this...
    // so we can serialize the db notification after the insert.
    // db notification cb makes it back to us before the insert
    // returns :(
    this.#q.add(async () => {
      const insertRet = await this.#insertChangesStmt!.get(
        this.#docid,
        new Uint8Array(yhash),
        update
      );
      this.#myApplications.add(BigInt(insertRet[0]));
      this.#capApplicationsSize();
    });
  };

  #capApplicationsSize() {
    if (this.#myApplications.size >= 100) {
      let i = 0;
      for (const entry of this.#myApplications) {
        if (i < 50) {
          this.#myApplications.delete(entry);
        } else {
          break;
        }
      }
    }
  }

  #dbChanged = async (notif: Map<string, Set<bigint>> | null) => {
    if (!this.#shouldProcessDbChange(notif)) {
      return;
    }
    console.log("processing db change from ", this.#lastDbVersion);

    const changes = await this.#getChangesStmt!.all(
      this.#docid,
      this.#lastDbVersion
    );

    // merge the changes into the doc
    Y.transact(
      this.#doc,
      () => {
        for (const c of changes) {
          Y.applyUpdate(this.#doc, c[0]);
          if (c[1] > this.#lastDbVersion) {
            this.#lastDbVersion = c[1];
          }
        }
      },
      this,
      false
    );
  };

  #shouldProcessDbChange(notif: Map<string, Set<bigint>> | null) {
    console.log(notif);
    if (notif == null) {
      return true;
    }

    const rowids = notif.get("ydoc");
    if (rowids == null) {
      // our table did not change
      // nothing to do
      return false;
    }

    // did the update contain a rid that we did not write?
    for (const rid of rowids) {
      if (!this.#myApplications.has(rid)) {
        console.log("did not have ", rid);
        return true;
      }
    }

    return false;
  }
}

export default async function create(
  db: DB | DBAsync,
  rx: TblRx,
  docid: string,
  doc: Y.Doc
): Promise<YjsProvider> {
  // 1. create table
  await db.execMany([
    `CREATE TABLE IF NOT EXISTS ydoc (
      doc_id TEXT,
      yhash BLOB,
      yval BLOB,
      primary key (doc_id, yhash)
    ) STRICT;`,
    `SELECT crsql_as_crr('ydoc');`,
  ]);

  const provider = new Provider(db, rx, docid, doc);
  // 2. listen to rx
  // 3. read state from table
  await provider.init();
  return provider;
}
