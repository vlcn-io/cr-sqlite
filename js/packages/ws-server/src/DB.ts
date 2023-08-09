import Database from "better-sqlite3";
import { Config } from "./config.js";
import path from "node:path";
import fs from "node:fs";
import { extensionPath } from "@vlcn.io/crsqlite";
import { Change, bytesToHex, cryb64 } from "@vlcn.io/ws-common";
import { throttle } from "throttle-debounce";

/**
 * Abstracts over a DB and provides just the operations requred by the sync server.
 *
 * We could theoretically use Turso in this setup. Once they support multi-tenancy.
 * fly and litefs is another option if we can control deploying ourselves.
 */
export default class DB {
  readonly #db;
  readonly #schemaName;
  readonly #schemaVersion;
  readonly #changeCallbacks = new Set<() => void>();
  readonly #siteid;
  readonly #getLastSeenStmt;
  readonly #getChangesStmt;
  readonly #applyChangesStmt;
  readonly #setLastSeenStmt;
  readonly #applyChangesAndSetLastSeenTx;

  constructor(
    config: Config,
    name: string,
    requestedSchema: string,
    requestedSchemaVersion: bigint
  ) {
    // TODO: different rooms may need different DB schemas.
    // We should support some way of defining this.
    const db = new Database(getDbPath(name, config));
    this.#db = db;
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");
    db.loadExtension(extensionPath);

    const schemaName = db
      .prepare("SELECT value FROM crsql_master WHERE key = 'schema_name'")
      .pluck()
      .get() as string | undefined;

    if (schemaName == null) {
      [this.#schemaName, this.#schemaVersion] = this.#applySchema(
        config,
        requestedSchema,
        requestedSchemaVersion
      );
    } else if (schemaName != requestedSchema) {
      throw new Error(
        `${requestedSchema} requested but the db is already configured with ${schemaName}`
      );
    } else {
      let schemaVersion = db
        .prepare("SELECT value FROM crsql_master WHERE key = 'schema_version'")
        .safeIntegers(true)
        .pluck()
        .get() as bigint | undefined;

      if (schemaVersion == null) {
        throw new Error(
          `Schema ${schemaName} was presente but with no version!`
        );
      }

      if (schemaVersion != requestedSchemaVersion) {
        schemaVersion = this.#tryUpdatingSchema(
          config,
          schemaName,
          requestedSchemaVersion
        );
        if (schemaVersion !== requestedSchemaVersion) {
          throw new Error(
            `The server is at schema version ${schemaVersion} which is not the same as the requested version ${requestedSchemaVersion}`
          );
        }
      }

      // We're on a matching version with the client.
      this.#schemaName = schemaName;
      this.#schemaVersion = schemaVersion;
    }

    this.#getLastSeenStmt = db
      .prepare<[Uint8Array]>(
        `SELECT version, seq FROM crsql_tracked_peers WHERE site_id = ? AND tag = 0 AND event = 0`
      )
      .raw(true)
      .safeIntegers();
    // NOTE: pulling `null` for site id.
    // this isn't always the proper way. Depends on network topology.
    // The most generic way is to always return site_id as that works in every topology
    // but we don't have compression built into our networking stack yet so we'll do a dirty optimization
    // that reduces data size but will require this to only be used in hub and spoke topologies.
    this.#getChangesStmt = db
      .prepare<[bigint, Uint8Array]>(
        `SELECT "table", "pk", "cid", "val", "col_version", "db_version", NULL, "cl" FROM crsql_changes WHERE db_version > ? AND site_id IS NOT ?`
      )
      .raw(true)
      .safeIntegers();
    this.#applyChangesStmt = db
      .prepare<[...Change]>(
        `INSERT INTO crsql_changes ("table", "pk", "cid", "val", "col_version", "db_version", "site_id", "cl") VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .safeIntegers();
    this.#siteid = db
      .prepare(`SELECT crsql_site_id()`)
      .pluck()
      .get() as Uint8Array;
    this.#setLastSeenStmt = db.prepare<[Uint8Array, bigint, number]>(
      `INSERT INTO crsql_tracked_peers (site_id, tag, event, version, seq) VALUES (?, 0, 0, ?, ?)
        ON CONFLICT DO UPDATE SET
          "version" = MAX("version", excluded."version"),
          "seq" = CASE "version" > excluded."version" WHEN 1 THEN "seq" ELSE excluded."seq" END`
    );
    this.#applyChangesAndSetLastSeenTx = this.#db.transaction(
      (
        changes: readonly Change[],
        siteId: Uint8Array,
        newLastSeen: readonly [bigint, number]
      ) => {
        for (const c of changes) {
          this.#applyChangesStmt.run(
            c[0],
            c[1],
            c[2],
            c[3],
            c[4],
            c[5],
            // see note about `null` above.
            siteId,
            c[7]
          );
        }

        this.#setLastSeenStmt.run(siteId, newLastSeen[0], newLastSeen[1]);
      }
    );
  }

  get siteId() {
    return this.#siteid;
  }

  get schemaName() {
    return this.#schemaName;
  }

  get schemaVersion() {
    return this.#schemaVersion;
  }

  getLastSeen(site: Uint8Array): [bigint, number] {
    const result = this.#getLastSeenStmt.raw(true).get(site) as
      | [bigint, bigint]
      | null;
    // No record of the client!
    if (result == null) {
      return [0n, 0];
    }
    return [result[0], Number(result[1])];
  }

  applyChangesetAndSetLastSeen(
    changes: readonly Change[],
    siteId: Uint8Array,
    newLastSeen: readonly [bigint, number]
  ): void {
    this.#applyChangesAndSetLastSeenTx(changes, siteId, newLastSeen);
    this.#notifyOfChange();
  }

  pullChangeset(
    since: readonly [bigint, number],
    excludeSite: Uint8Array
  ): readonly Change[] {
    return this.#getChangesStmt.all(since[0], excludeSite) as Change[];
  }

  schemasMatch(schemaName: string, schemaVersion: bigint): boolean {
    return (
      schemaName === this.#schemaName && schemaVersion === this.#schemaVersion
    );
  }

  onChange(cb: () => void) {
    this.#changeCallbacks.add(cb);
    return () => {
      this.#changeCallbacks.delete(cb);
    };
  }

  /**
   * A trivial `notifyOfChange` implementation.
   *
   * Our other server implementations support geo-distributed strongly consistent replication of the DB **and** change
   * notification.
   *
   * This here only supports monitoring changes to a DB that are made through the same instance
   * of this class. Given all connections share the same DB instance, via DBCache, this works for now.
   *
   * @param cb
   */
  // TODO: a better implementation would understand the current backpressure on different
  // websockets rather than a random 50 ms throttle.
  #notifyOfChange = throttle(50, () => {
    for (const cb of this.#changeCallbacks) {
      try {
        cb();
        // failure of 1 callback shouldn't prevent notification of other callbacks.
      } catch (e) {
        console.warn(e);
      }
    }
  });

  close() {
    this.#db.prepare(`SELECT crsql_finalize()`).run();
    this.#db.close();
  }

  // No schema exists on the db. Straight apply it.
  #applySchema(
    config: Config,
    name: string,
    version: bigint
  ): [string, bigint] {
    const content = fs.readFileSync(getSchemaPath(name, config), "utf-8");
    const residentVersion = cryb64(content);
    if (residentVersion != version) {
      throw new Error(
        `Server has schema version ${residentVersion} but client requested ${version}`
      );
    }
    this.#db.transaction(() => {
      this.#db.exec(content);
      this.#db
        .prepare(
          `INSERT OR REPLACE INTO crsql_master (key, value) VALUES (?, ?)`
        )
        .run("schema_version", version);
      this.#db
        .prepare(
          `INSERT OR REPLACE INTO crsql_master (key, value) VALUES (?, ?)`
        )
        .run("schema_name", name);
    })();

    return [name, version];
  }

  // A schema exists and the client requested a version different than
  // the installed version. Try updating.
  #tryUpdatingSchema(
    config: Config,
    schemaName: string,
    requestedVersion: bigint
  ): bigint {
    const content = fs.readFileSync(getSchemaPath(schemaName, config), "utf-8");
    const residentVersion = cryb64(content);
    if (residentVersion != requestedVersion) {
      throw new Error(
        `Server has schema version ${residentVersion} but client requested ${requestedVersion}`
      );
    }

    this.#db.transaction(() => {
      this.#db.prepare(`SELECT crsql_automigrate(?)`).run(content);
      this.#db
        .prepare(
          `INSERT OR REPLACE INTO crsql_master (key, value) VALUES (?, ?)`
        )
        .run("schema_version", requestedVersion);
    })();

    return requestedVersion;
  }
}

function getDbPath(dbName: string, config: Config) {
  if (hasPathParts(dbName)) {
    throw new Error(`${dbName} must not include '..', '/', or '\\'`);
  }

  // allow for in-memory db and ephemeral sync
  // it'll last as long as participants are in the room.
  // we could also sync w/o an in-memory DB (e.g., by proxing messages) but this lets us keep the ephemeral
  // and persisted sync identical.
  // Note: room name is dbname so we'd have to indicate :memory: some other way.
  if (dbName === ":memory:" || config.dbFolder == null) {
    return ":memory:";
  }

  return path.join(config.dbFolder, dbName);
}

function getSchemaPath(schemaName: string, config: Config) {
  if (hasPathParts(schemaName)) {
    throw new Error(`${schemaName} must not include '..', '/', or '\\'`);
  }

  return path.join(config.schemaFolder, schemaName);
}

function hasPathParts(s: string) {
  return s.includes("..") || s.includes("/") || s.includes("\\");
}
