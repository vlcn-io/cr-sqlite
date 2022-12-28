import * as Y from "yjs";
import { DB, DBAsync, Stmt, StmtAsync } from "@vlcn.io/xplat-api";
import { TblRx } from "@vlcn.io/rx-tbl";

export interface YjsProvider {}

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

  constructor(db: DB | DBAsync, rx: TblRx, docid: string, doc: Y.Doc) {
    this.#doc = doc;
    this.#db = db;
    this.#rx = rx;
    this.#docid = docid;
    // TODO: listen for DB updates to merge back into the doc
    // via tblrx.
    // What rows do we want?
    // - rows from ydoc table where clock > last pulled clock and doc_id = our doc id
  }

  async init() {
    [this.#getChangesStmt, this.#insertChangesStmt] = await Promise.all([
      this.#db.prepare(
        `SELECT ydoc.yval FROM
        ydoc__crsql_clock as clock JOIN ydoc ON
          ydoc.doc_id = clock.doc_id AND
          ydoc.ysite = clock.ysite AND
          ydoc.yclock = clock.yclock
      WHERE clock.doc_id = ? AND clock.db_version > ?`
      ),
      this.#db.prepare(
        `INSERT INTO ydoc (doc_id, yclock, ysite, yval) VALUES (?, ?, ?, ?) RETURNING yclock, ysite`
      ),
    ]);

    // observe before populating doc in case changes
    // come in while populating doc, those updates will be queued
    // to be applied.
    this.#rx.on(this.#dbChanged);

    // populate doc
    await this.#dbChanged(new Set(["ydoc"]));

    // now listen to doc to write changes back to db on doc change.
    this.#doc.on("update", this.#docUpdated);
    this.#doc.on("destroy", this.dispose);
  }

  dispose = () => {
    this.#getChangesStmt?.finalize();
    this.#insertChangesStmt?.finalize();
  };

  #docUpdated = (update: Uint8Array, origin: any) => {
    if (origin == this) {
      // change from our db, no need to save it to the db
      return;
    }
    const decoded = Y.decodeUpdate(update);

    // write to db
    // note: we may want to debounce this? no need to save immediately after every keystroke.
  };

  #dbChanged = async (tbls: Set<string>) => {
    if (!tbls.has("ydoc")) {
      // nothing to do
      return;
    }

    // TODO: wait tho.. we don't want to respond to our own changes
    // we only want to respond to sync event changes
    // we could `returning rowid` to understand what rowid we created
    // and exclude rx callbacks of those rowids...

    const getChangesStmt = this.#getChangesStmt!;
    const changes = await getChangesStmt.all(this.#docid, this.#lastDbVersion);

    // merge the changes into the doc
    Y.transact(this.#doc, () => {}, this, false);
  };
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
      yclock INTEGER,
      ysite INTEGER,
      yval BLOB,
      primary key (doc_id, ysite, yclock)
    ) STRICT;`,
    `SELECT crsql_as_crr('ydoc');`,
  ]);

  const provider = new Provider(db, rx, docid, doc);
  // 2. listen to rx
  // 3. read state from table
  await provider.init();
  return provider;
}
