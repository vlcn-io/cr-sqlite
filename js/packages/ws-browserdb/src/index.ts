import { DB } from "@vlcn.io/ws-client";
import initWasm, { DB as WasmDB } from "@vlcn.io/crsqlite-wasm";
import { Change, cryb64 } from "@vlcn.io/ws-common";
import { StmtAsync, firstPick } from "@vlcn.io/xplat-api";
import tblrx from "@vlcn.io/rx-tbl";

export type Options = {
  schemaName: string;
  schemaContent: string;
};

const ENVIRONMENT_IS_WORKER = typeof importScripts === "function";

class WrappedDB implements DB {
  readonly #db;
  readonly #pullChangesetStmt;
  readonly #applyChangesetStmt;
  readonly #updatePeerTrackerStmt;
  // TODO: the assumption here is that the schema is not changing at runtime
  // after we have started sync but this could be a bad assumption
  readonly #schemaName;
  readonly #schemaVersion;
  readonly #rx;

  constructor(
    db: WasmDB,
    public readonly siteid: Uint8Array,
    schemaName: string,
    schemaVersion: bigint,
    pullChangesetStmt: StmtAsync,
    applyChangesetStmt: StmtAsync,
    updatePeerTrackerStmt: StmtAsync
  ) {
    this.#db = db;
    this.#pullChangesetStmt = pullChangesetStmt;
    this.#applyChangesetStmt = applyChangesetStmt;
    this.#updatePeerTrackerStmt = updatePeerTrackerStmt;
    this.#schemaName = schemaName;
    this.#schemaVersion = schemaVersion;
    this.#rx = tblrx(db);
  }

  // TODO: we're currently only looking at the first excluded site.
  async pullChangeset(
    since: readonly [bigint, number],
    excludeSites: readonly Uint8Array[],
    localOnly: boolean
  ): Promise<readonly Change[]> {
    console.log(
      "Asked for changes since:",
      since[0],
      "excluding:",
      excludeSites[0]
    );
    const ret = await this.#pullChangesetStmt.all(
      null,
      since[0],
      excludeSites[0]
    );
    console.log(`returning ${ret.length} changes`);
    return ret;
  }

  async applyChangesetAndSetLastSeen(
    changes: readonly Change[],
    siteId: Uint8Array,
    end: readonly [bigint, number]
  ): Promise<void> {
    await this.#db.tx(async (tx) => {
      for (const c of changes) {
        await this.#applyChangesetStmt.run(
          tx,
          c[0],
          c[1],
          c[2],
          c[3],
          c[4],
          c[5],
          c[6],
          // TODO: see the `null` note on the server side impl.
          // We'll need to change this for production grade sync primitives.
          siteId,
          c[7]
        );
      }
      await this.#updatePeerTrackerStmt.run(tx, siteId, 0, end[0], end[1]);
    });
  }

  async getLastSeens(): Promise<[Uint8Array, [bigint, number]][]> {
    const rows = await this.#db.execA<[Uint8Array, bigint | number, number]>(
      `SELECT site_id, version, seq FROM crsql_tracked_peers`
    );
    return rows.map((r) => [r[0], [BigInt(r[1]), r[2]]]);
  }

  async getSchemaNameAndVersion(): Promise<[string, bigint]> {
    return [this.#schemaName, this.#schemaVersion];
  }

  /**
   * Allow the sync layer to observe when the database changes as a result
   * of non-sync events.
   */
  onChange(cb: () => void): () => void {
    return this.#rx.onAny((_, src) => {
      // TODO: if sync is running in a dedicated worker then we want to ignore changes when
      // src == thisProcess
      // but if it is running inline we don't want to ignore.
      // We should force sync to run in a worker in the browser so:
      // 1. we don't try to sync sync events
      // 2. we don't block the main thread
      if (ENVIRONMENT_IS_WORKER) {
        if (src !== "thisProcess") {
          cb();
        }
      } else {
        // We need a reliable way to filter out our own events if we're not in a worker.
        cb();
      }
    });
  }

  close(closeWrappedDB: boolean): void {
    this.#pullChangesetStmt.finalize(null);
    this.#applyChangesetStmt.finalize(null);
    this.#updatePeerTrackerStmt.finalize(null);
    this.#rx.dispose();
    if (closeWrappedDB) {
      this.#db.close();
    }
  }
}

/**
 * This'll instantiate a NEW wasm instance for each db.
 *
 * TODO: If you'd like the _share_ the same wasm instance between your application and the sync layer
 * you'll need to write your own `dbProvider` function.
 *
 * @param dbname
 * @returns
 */
export function createDbProvider(
  wasmUri: string | undefined,
  options?: Options
): (dbname: string) => PromiseLike<DB> {
  return async (dbname: string): Promise<DB> => {
    const sqlite = await initWasm(wasmUri ? () => wasmUri : undefined);
    const db = await sqlite.open(dbname);

    const [pullChangesetStmt, applyChangesetStmt, updatePeerTrackerStmt] =
      await Promise.all([
        db.prepare(
          `SELECT "table", "pk", "cid", "val", "col_version", "db_version", "cl" FROM crsql_changes WHERE db_version > ? AND site_id IS NOT ?`
        ),
        db.prepare(
          `INSERT INTO crsql_changes ("table", "pk", "cid", "val", "col_version", "db_version", "site_id", "cl") VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ),
        db.prepare(
          `INSERT INTO "crsql_tracked_peers" ("site_id", "event", "version", "seq", "tag") VALUES (?, ?, ?, ?, 0) ON CONFLICT DO UPDATE SET
          "version" = MAX("version", excluded."version"),
          "seq" = CASE "version" > excluded."version" WHEN 1 THEN "seq" ELSE excluded."seq" END`
        ),
      ]);
    pullChangesetStmt.raw(true);

    let siteid = (await db.execA<[Uint8Array]>(`SELECT crsql_site_id()`))[0][0];

    const [schemaName, schemaVersion] = await applyOrGetSchemaDetails(
      db,
      options?.schemaName,
      options?.schemaContent
    );

    return new WrappedDB(
      db,
      siteid,
      schemaName,
      schemaVersion,
      pullChangesetStmt,
      applyChangesetStmt,
      updatePeerTrackerStmt
    );
  };
}

// TODO: the sync service probably should not incoroprate any schema application logic as it is now doing below.
async function applyOrGetSchemaDetails(
  db: WasmDB,
  schemaName?: string,
  schemaContent?: string
): Promise<[string, bigint]> {
  console.log("apply or get...");
  const storedName = firstPick<string>(
    await db.execA<[string]>(
      `SELECT value FROM crsql_master WHERE key = 'schema_name'`
    )
  );
  const storedVersion = BigInt(
    firstPick<number | bigint>(
      await db.execA<[number | bigint]>(
        `SELECT value FROM crsql_master WHERE key = 'schema_version'`
      )
    ) || -1
  );

  if (schemaName == null || schemaContent == null) {
    if (storedName == null) {
      throw new Error(
        `Illegal state -- DB has no schema and no schema was supplied to apply to it`
      );
    }
    return [storedName, storedVersion];
  }

  const schemaVersion = cryb64(schemaContent);
  if (storedName === schemaName && storedVersion === schemaVersion) {
    return [storedName, storedVersion];
  }

  await db.tx(async (tx) => {
    console.log(schemaContent);
    await tx.exec(`SELECT crsql_automigrate(?)`, [schemaContent]);
    console.log("automigrated?");
    await tx.exec(
      `INSERT OR REPLACE INTO crsql_master (key, value) VALUES (?, ?)`,
      ["schema_name", schemaName]
    );
    await tx.exec(
      `INSERT OR REPLACE INTO crsql_master (key, value) VALUES (?, ?)`,
      ["schema_version", schemaVersion]
    );
  });

  return [schemaName, schemaVersion];
}
