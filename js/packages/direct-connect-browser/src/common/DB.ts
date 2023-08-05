import initWasm from "@vlcn.io/crsqlite-wasm";
import { DBAsync, StmtAsync } from "@vlcn.io/xplat-api";
import { TXAsync } from "@vlcn.io/xplat-api";
import { DBID } from "@vlcn.io/xplat-api";
import {
  SCHEMA_NAME,
  SCHEMA_VERSION,
  hexToBytes,
  Change as Changeset,
} from "@vlcn.io/direct-connect-common";

export type CID = string;
export type QuoteConcatedPKs = string;
export type TableName = string;
export type Version = bigint;
export type Val = string | null;
export type Seq = readonly [Version, number];

export const RECEIVE = 0 as const;
export const SEND = 1 as const;
type VersionEvent = typeof RECEIVE | typeof SEND;

export class DB {
  public readonly remoteDbidBytes: Uint8Array;

  constructor(
    public readonly db: DBAsync,
    public readonly localDbid: DBID,
    public readonly remoteDbid: DBID,
    public readonly schemaName: string,
    public readonly schemaVersion: bigint,
    private readonly pullChangesetStmt: StmtAsync,
    private readonly applyChangesetStmt: StmtAsync,
    private readonly updatePeerTrackerStmt: StmtAsync
  ) {
    this.remoteDbidBytes = hexToBytes(this.remoteDbid);
  }

  async pullChangeset(seq: Seq): Promise<Changeset[]> {
    // pull changes since we last sent the server changes,
    // excluding what the server has sent us
    const ret = await this.pullChangesetStmt.all(null, BigInt(seq[0]));
    // make sure we actually got bigints back
    // if they're smaller than bigints they'll be returned as numbers
    for (const c of ret) {
      c[4] = BigInt(c[4]);
      c[5] = BigInt(c[5]);
    }
    return ret;
  }

  async seqIdFor(
    siteId: Uint8Array,
    event: VersionEvent
  ): Promise<[Version, number]> {
    const rows = await this.db.execA(
      "SELECT version, seq FROM crsql_tracked_peers WHERE site_id = ? AND event = ?",
      [siteId, event]
    );
    if (rows.length == 0) {
      // never seen the site before
      return [0n, 0];
    }
    const row = rows[0];

    return [BigInt(row[0]), row[1]];
  }

  async applyChangeset(tx: TXAsync, changes: readonly Changeset[]) {
    for (const cs of changes) {
      // have to run serially given wasm build
      // isn't actually multithreaded
      // TODO: why is the error not thrown when run fails?!
      await this.applyChangesetStmt.run(
        tx,
        cs[0],
        cs[1],
        cs[2],
        cs[3],
        cs[4],
        cs[5],
        this.remoteDbidBytes,
        cs[6]
      );
    }
  }

  async updatePeerTracker(
    tx: TXAsync,
    event: VersionEvent,
    seqEnd: readonly [Version, number]
  ) {
    await this.updatePeerTrackerStmt.run(
      tx,
      this.remoteDbidBytes,
      event,
      BigInt(seqEnd[0]),
      seqEnd[1]
    );
  }

  async close() {
    await this.db.close();
    await this.pullChangesetStmt.finalize(null);
    await this.applyChangesetStmt.finalize(null);
    await this.updatePeerTrackerStmt.finalize(null);
  }
}

export default async function getDB(wasmUri: string | undefined, dbid: DBID) {
  const sqlite = await initWasm(wasmUri ? () => wasmUri : undefined);
  const db = await sqlite.open(dbid);

  const [pullChangesetStmt, applyChangesetStmt, updatePeerTrackerStmt] =
    await Promise.all([
      db.prepare(
        `SELECT "table", "pk", "cid", "val", "col_version", "db_version", "cl" FROM crsql_changes WHERE db_version > ? AND site_id IS NULL`
      ),
      db.prepare(
        `INSERT INTO crsql_changes ("table", "pk", "cid", "val", "col_version", "db_version", "site_id", "cl") VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ),
      db.prepare(
        `INSERT INTO "crsql_tracked_peers" ("site_id", "event", "version", "seq", "tag") VALUES (?, ?, ?, ?, 0) ON CONFLICT DO UPDATE SET
          "version" = MAX("version", excluded."version"),
          "seq" = excluded."seq"`
      ),
    ]);
  pullChangesetStmt.raw(true);

  let siteid = (await db.execA(`SELECT quote(crsql_site_id())`))[0][0];
  siteid = siteid.slice(2, -1); // remove X'' quoting

  const schemaNameResult = await db.execA(
    `SELECT value FROM crsql_master WHERE key = '${SCHEMA_NAME}'`
  );
  const schemaVersionResult = await db.execA(
    `SELECT value FROM crsql_master WHERE key = '${SCHEMA_VERSION}'`
  );

  if (schemaNameResult.length == 0 || schemaVersionResult.length == 0) {
    throw new Error(
      `DB must have had a schema applied to it to do sync.
        No schema name or version found.
        Either apply one via "db.automigrateTo" or manually set schema name and verison in crsql_master.
        E.g., INSERT INTO crsql_master VALUES ('schema_name', 'name'), ('schema_version', 1)`
    );
  }

  return new DB(
    db,
    siteid,
    dbid,
    schemaNameResult[0][0],
    BigInt(schemaVersionResult[0][0]),
    pullChangesetStmt,
    applyChangesetStmt,
    updatePeerTrackerStmt
  );
}
