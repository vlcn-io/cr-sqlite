import SQLiteDB from "better-sqlite3";
import type { Database } from "better-sqlite3";
import { Config } from "../Types.js";
import { Change, bytesToHex } from "@vlcn.io/direct-connect-common";
import { extensionPath } from "@vlcn.io/crsqlite";
import util from "./util.js";
import touchHack from "./touchHack.js";
import { SchemaRow } from "./ServiceDB.js";
import logger from "../logger.js";

/**
 * Wraps a normal better-sqlite3 connection to provide
 * easy access to things like site id, changeset pulling, seen peers.
 *
 * Creates the connection, set correct WAL mode, loads cr-sqlite extension.
 */
export default class DB {
  private readonly db: Database;
  readonly #pullChangesetStmt: SQLiteDB.Statement;
  readonly #applyChangesTx;

  public readonly getSinceLastApplyStmt: SQLiteDB.Statement;
  public readonly setSinceLastApplyStmt: SQLiteDB.Statement;

  constructor(
    private readonly config: Config,
    private readonly dbid: Uint8Array,
    private readonly schemaProvider: (
      name: string,
      version: bigint
    ) => SchemaRow | undefined
  ) {
    this.db = new SQLiteDB(util.getDbFilename(config, dbid));
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");

    // check if siteid table exists
    const siteidTableExists = this.db
      .prepare(
        "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='__crsql_site_id'"
      )
      .pluck()
      .get();
    if (siteidTableExists == 0) {
      this.db.exec(
        `CREATE TABLE __crsql_site_id (site_id BLOB NOT NULL, ordinal INTEGER PRIMARY KEY AUTOINCREMENT)`
      );
      this.db
        .prepare(
          `INSERT INTO "__crsql_site_id" (site_id, ordinal) VALUES (?, 0)`
        )
        .run(dbid);
    }

    this.db.loadExtension(extensionPath);
    this.#pullChangesetStmt = this.db.prepare(
      `SELECT "table", "pk", "cid", "val", "col_version", "db_version", "cl" FROM crsql_changes WHERE db_version > ? AND site_id IS NOT ?`
    );
    this.#pullChangesetStmt.raw(true);
    this.#pullChangesetStmt.safeIntegers(true);
    const applyChangesetStmt = this.db.prepare(
      `INSERT INTO crsql_changes ("table", "pk", "cid", "val", "col_version", "db_version", "site_id", "cl") VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    this.#applyChangesTx = this.db.transaction(
      (from: Uint8Array, changes: readonly Change[]) => {
        let maxVersion = 0n;
        for (const cs of changes) {
          if (cs[5] > maxVersion) {
            maxVersion = cs[5];
          }
          applyChangesetStmt.run(
            cs[0],
            cs[1],
            cs[2],
            cs[3],
            cs[4],
            cs[5],
            from,
            cs[6]
          );
        }
        return [maxVersion, 0] as [bigint, number];
      }
    );

    this.getSinceLastApplyStmt = this.db.prepare(
      `SELECT version, seq FROM crsql_tracked_peers WHERE site_id = ? AND tag = 0 AND event = 0`
    );
    this.getSinceLastApplyStmt.raw(true);
    this.setSinceLastApplyStmt = this.db.prepare(
      `INSERT OR REPLACE INTO crsql_tracked_peers (site_id, tag, event, version, seq) VALUES (?, 0, 0, ?, ?)`
    );
  }

  prepare(stmt: string): SQLiteDB.Statement {
    return this.db.prepare(stmt);
  }

  transaction(fn: (...args: any[]) => void): SQLiteDB.Transaction {
    return this.db.transaction(fn);
  }

  __testsOnly(): Database {
    return this.db;
  }

  // TODO: when we're on litestream and have different nodes processing live streams
  // we'll need to tell them to check for schema changes.
  // We can do that before they pull changes for their stream and check schema version.
  // Maybe just do that by default? If schema version changes from last pull in stream, re-stablish a connection?
  // there's obvi the pragma to retrieve current schema version from sqlite.
  migrateTo(
    schemaName: string,
    version: bigint,
    ignoreNameMismatch: boolean = false
  ): "noop" | "apply" | "migrate" {
    // get current schema version
    const storedVersion = this.db
      .prepare(`SELECT value FROM crsql_master WHERE key = 'schema_version'`)
      .safeIntegers(true)
      .pluck()
      .get();
    const storedName = this.db
      .prepare(`SELECT value FROM crsql_master WHERE key = 'schema_name'`)
      .pluck()
      .get();

    if (
      !ignoreNameMismatch &&
      storedName != null &&
      storedName !== schemaName
    ) {
      throw new Error(
        `Cannot migrate between completely different schemas. from ${storedName} to ${schemaName}`
      );
    }

    if (storedVersion === version) {
      // no-op, no need to apply schema
      return "noop";
    }

    const schema = this.schemaProvider(schemaName, version);
    if (schema == null || schema.active == false) {
      throw new Error(
        `Schema ${schemaName} version ${version} is not active or does not exists`
      );
    }
    // some version of the schema already exists. Run auto-migrate.
    this.db.transaction(() => {
      if (storedVersion == null) {
        this.db.exec(schema.content);
      } else {
        this.db.prepare(`SELECT crsql_automigrate(?)`).run(schema.content);
      }
      this.db
        .prepare(
          `INSERT OR REPLACE INTO crsql_master (key, value) VALUES (?, ?)`
        )
        .run("schema_version", version);
      this.db
        .prepare(
          `INSERT OR REPLACE INTO crsql_master (key, value) VALUES (?, ?)`
        )
        .run("schema_name", schemaName);
    })();
    return storedVersion == null ? "apply" : "migrate";
  }

  applyChanges(from: Uint8Array, changes: readonly Change[]): [bigint, number] {
    // TODO: do we not need to check that the application is contiguous?
    // as well as update the last seen version?
    // not here. DBSyncService should do that I think.
    const ret = this.#applyChangesTx(from, changes);

    // probably in the future just set up some msg queue service.
    touchHack(this.config, this.dbid);

    return ret;
  }

  getChanges(requestor: Uint8Array, since: bigint): Change[] {
    // logger.info("getting changes. requestor: " + bytesToHex(requestor) + " since: " + since);
    return this.#pullChangesetStmt.all(since, requestor) as Change[];
  }

  close() {
    this.db.exec("SELECT crsql_finalize()");
    this.db.close();
  }
}
