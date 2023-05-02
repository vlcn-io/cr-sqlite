import initWasm from "@vlcn.io/crsqlite-wasm";
// @ts-ignore
import wasmUrl from "@vlcn.io/crsqlite-wasm/crsqlite.wasm?url";
import { DBAsync, StmtAsync } from "@vlcn.io/xplat-api";
import { TXAsync } from "@vlcn.io/xplat-api";

export type CID = string;
export type QuoteConcatedPKs = string;
export type TableName = string;
export type Version = bigint;
export type Val = string | null;
export type Seq = [Version, number];

export const RECEIVE = 0 as const;
export const SEND = 1 as const;
type VersionEvent = typeof RECEIVE | typeof SEND;

export type Changeset = [
  TableName,
  QuoteConcatedPKs,
  CID,
  Val,
  Version, // col version
  Version // db version
  // site_id is omitted. Will be applied by the receiver
  // who always knows site ids in client-server setup.
  // server masks site ids of clients. This masking
  // is disallowed in p2p topologies.
];

export class DB {
  constructor(
    private readonly db: DBAsync,
    public readonly dbid: string,
    private readonly pullChangesetStmt: StmtAsync,
    private readonly applyChangesetStmt: StmtAsync,
    private readonly updatePeerTrackerStmt: StmtAsync
  ) {}

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

  async applyChangeset(
    tx: TXAsync,
    from: Uint8Array,
    changes: readonly Changeset[]
  ) {
    for (const cs of changes) {
      // have to run serially given wasm build
      // isn't actually multithreaded
      await this.applyChangesetStmt.run(
        tx,
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

  async updatePeerTracker(
    tx: TXAsync,
    fromBin: Uint8Array,
    event: VersionEvent,
    seqEnd: readonly [Version, number]
  ) {
    await this.updatePeerTrackerStmt.run(
      tx,
      fromBin,
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

export default async function getDB(dbid: string) {
  const sqlite = await initWasm(() => wasmUrl);
  const db = await sqlite.open(dbid);

  const [pullChangesetStmt, applyChangesetStmt, updatePeerTrackerStmt] =
    await Promise.all([
      db.prepare(
        `SELECT "table", "pk", "cid", "val", "col_version", "db_version" FROM crsql_changes WHERE db_version > ? AND site_id IS NULL`
      ),
      db.prepare(
        `INSERT INTO crsql_changes ("table", "pk", "cid", "val", "col_version", "db_version", "site_id") VALUES (?, ?, ?, ?, ?, ?, ?)`
      ),
      db.prepare(
        `INSERT INTO "crsql_tracked_peers" ("site_id", "event", "version", "seq", "tag") VALUES (?, ?, ?, ?, 0) ON CONFLICT DO UPDATE SET
          "version" = MAX("version", excluded."version"),
          "seq" = excluded."seq"`
      ),
    ]);

  let siteid = (await db.execA(`SELECT quote(crsql_siteid())`))[0][0];
  siteid = siteid.slice(2, -1); // remove X'' quoting

  return new DB(
    db,
    siteid,
    pullChangesetStmt,
    applyChangesetStmt,
    updatePeerTrackerStmt
  );
}
