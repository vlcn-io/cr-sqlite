import * as Y from "yjs";
import { DB, DBAsync, Stmt, StmtAsync } from "@vlcn.io/xplat-api";
import { TblRx } from "@vlcn.io/rx-tbl";

function bytesToHex(bytes: Uint8Array) {
  for (var hex = [], i = 0; i < bytes.length; i++) {
    var current = bytes[i] < 0 ? bytes[i] + 256 : bytes[i];
    hex.push((current >>> 4).toString(16));
    hex.push((current & 0xf).toString(16));
  }
  return hex.join("");
}

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
  #myApplications;

  constructor(db: DB | DBAsync, rx: TblRx, docid: string, doc: Y.Doc) {
    this.#doc = doc;
    this.#db = db;
    this.#rx = rx;
    this.#docid = docid;
    this.#myApplications = new Set<string>();
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
          ydoc.yhash = clock.yhash
      WHERE clock.doc_id = ? AND clock.db_version > ?`
      ),
      this.#db.prepare(
        `INSERT INTO ydoc (doc_id, yhash, yval) VALUES (?, ?, ?) RETURNING yhash`
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

  #docUpdated = async (update: Uint8Array, origin: any) => {
    if (origin == this) {
      // change from our db, no need to save it to the db
      return;
    }
    const yhash = await crypto.subtle.digest("SHA-1", update);
    this.#myApplications.add(bytesToHex(new Uint8Array(yhash)));
    this.#capApplicationsSize();

    // note: if someone did a transaction we'll receive many updates to apply at once in
    // our observer.
    //
    // i.e., `decodeUpdate` will return many structs.
    // if we want to use crsqlite replication this is a no go since we don't want
    // to resync out own changes and grow.
    // our change -> B
    //    \--> C ---/\
    // C would pass back on to B since we can't identity these structs.
    // Well... you could with a hash. Given these updates should be immutable and append-only
    // What if someone compacts their doc?
    // Then you're screwed in all ways.
    //
    // we don't do the `yjs` level db thing bc it reconstructs the entire doc
    // in order to compute diffs: https://github.com/yjs/y-leveldb/blob/74daedd13b6cc781ebf5c5158c4dd5e245926ba4/src/y-leveldb.js#L454
    // rather than just computing diffs via a `SELECT * FROM doc WHERE clock > clockx AND doc_id = doc_idx`

    // write to db
    // note: we may want to debounce this? no need to save immediately after every keystroke.
  };

  #capApplicationsSize() {
    if (this.#myApplications.size >= 200) {
      let i = 0;
      for (const entry of this.#myApplications) {
        if (i < 100) {
          this.#myApplications.delete(entry);
        } else {
          break;
        }
      }
    }
  }

  #dbChanged = async (tbls: Set<string>) => {
    if (!tbls.has("ydoc")) {
      // nothing to do
      return;
    }

    // wait.. we need rowids returned so those can be passed and we can ignore dbchanged
    // if the changed things are rows we just wrote.
    //
    // other option is to create a `sync only` rx that only calls back on sync events.

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
