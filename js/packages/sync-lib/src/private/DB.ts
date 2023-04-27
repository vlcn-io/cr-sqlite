import SQLiteDB from "better-sqlite3";
import type { Database } from "better-sqlite3";
import { Change, Config } from "../Types.js";
import { extensionPath } from "@vlcn.io/crsqlite";
import util from "../util.js";

/**
 * Wraps a normal better-sqlite3 connection to provide
 * easy access to things like site id, changeset pulling, seen peers.
 *
 * Creates the connection, set correct WAL mode, loads cr-sqlite extension.
 */
export default class DB {
  private readonly db: Database;
  readonly #pullChangesetStmt: SQLiteDB.Statement;
  readonly #applyChangesTx: SQLiteDB.Transaction;

  constructor(config: Config, dbid: string) {
    this.db = new SQLiteDB(util.getDbFilename(config, dbid));
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.db.loadExtension(extensionPath);

    this.#pullChangesetStmt = this.db.prepare(
      `SELECT "table", "pk", "cid", "val", "col_version", "db_version" FROM crsql_changes WHERE db_version > ? AND site_id IS NOT ?`
    );
    this.#pullChangesetStmt.raw(true);

    const applyChangesetStmt = this.db.prepare(
      `INSERT INTO crsql_changes ("table", "pk", "cid", "val", "col_version", "db_version", "site_id") VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    this.#applyChangesTx = this.db.transaction(
      (from: Uint8Array, changes: readonly Change[]) => {
        for (const cs of changes) {
          applyChangesetStmt.run(
            cs[0],
            cs[1],
            cs[2],
            cs[3],
            cs[4],
            cs[5],
            from
          );
        }
      }
    );
  }

  applyChanges(from: Uint8Array, changes: readonly Change[]) {
    // TODO: do we not need to check that the application is contiguous?
    // as well as update the last seen version?
    // not here. DBSyncService should do that I think.
    this.#applyChangesTx(from, changes);
  }

  pullChangeset(
    requestor: Uint8Array,
    since: number
  ): IterableIterator<Change> {
    const iter = this.#pullChangesetStmt.iterate(
      since,
      requestor
    ) as IterableIterator<Change>;
    return iter;
  }

  close() {
    this.db.exec("SELECT crsql_finalize()");
    this.db.close();
  }
}
