import { Changeset, SiteIdWire, Version } from "@vlcn.io/client-server-common";
import { DB as DBSync, DBAsync, Stmt, StmtAsync } from "@vlcn.io/xplat-api";
import {
  parse as uuidParse,
  stringify as uuidStringify,
  v4 as uuidv4,
} from "uuid";
import { TblRx } from "@vlcn.io/rx-tbl/src/tblrx";
import logger from "./logger";

export const RECEIVE = 0 as const;
export const SEND = 1 as const;
type VersionEvent = typeof RECEIVE | typeof SEND;

/**
 * Wraps the DB and exposes the minimal interface required
 * by the network layer.
 */
export class DB {
  private readonly siteIdAsBlob: Uint8Array;

  constructor(
    private readonly db: DBSync | DBAsync,
    public readonly siteId: SiteIdWire,
    private readonly rx: TblRx,
    private readonly pullChangesetStmt: Stmt | StmtAsync,
    private readonly applyChangesetStmt: Stmt | StmtAsync,
    private readonly updatePeerTrackerStmt: Stmt | StmtAsync
  ) {
    this.siteIdAsBlob = new Uint8Array(uuidParse(this.siteId));
    if (!this.siteId) {
      throw new Error(`Unable to fetch site id from the local db`);
    }
  }

  onUpdate(cb: () => void) {
    return this.rx.on(cb);
  }

  async seqIdFor(
    siteId: SiteIdWire,
    event: VersionEvent
  ): Promise<[Version, number]> {
    const parsed = uuidParse(siteId);
    const rows = await this.db.execA(
      "SELECT version, seq FROM crsql_tracked_peers WHERE site_id = ? AND event = ?",
      [parsed, event]
    );
    if (rows.length == 0) {
      // never seen the site before
      return [0n, 0];
    }
    const row = rows[0];

    // handle possible bigint return
    return [row[0].toString(), row[1]];
  }

  // TODO: track seq monotonicity
  async applyChangeset(
    from: SiteIdWire,
    changes: Changeset[],
    seqEnd: [Version, number]
  ) {
    // write them then notify safely
    const fromBin = uuidParse(from);
    await this.db.transaction(async () => {
      for (const cs of changes) {
        // have to run serially given wasm build
        // isn't actually multithreaded
        // TODO: can we optimize by creating 1 giant
        // insert statement with all the values?
        // or at least batch to 100 rows at a time in a single insert
        await this.applyChangesetStmt.run(
          cs[0],
          cs[1],
          cs[2],
          cs[3],
          cs[4],
          cs[5],
          fromBin
        );
      }

      // now update our record of the server
      await this.updatePeerTracker(from, RECEIVE, seqEnd);
    });
  }

  async updatePeerTracker(
    from: SiteIdWire,
    event: VersionEvent,
    seqEnd: [Version, number]
  ) {
    console.log(from);
    await this.updatePeerTrackerStmt.run(
      uuidParse(from),
      event,
      BigInt(seqEnd[0]),
      seqEnd[1]
    );
  }

  // TODO: we could just omit site id from the changeset
  // given the server will know what site id it is from
  // if we're doing a binary format we should also do this a layer
  // up the stack so we can encode msg types too
  async pullChangeset(seq: [Version, number]): Promise<Changeset[]> {
    logger.info("Pulling changes since ", seq);
    // pull changes since we last sent the server changes,
    // excluding what the server has sent us
    const ret = await this.pullChangesetStmt.all(BigInt(seq[0]));
    // make sure we actually got bigints back
    // if they're smaller than bigints they'll be returned as numbers
    for (const c of ret) {
      c[4] = BigInt(c[4]);
      c[5] = BigInt(c[5]);
    }
    return ret;
  }

  dispose() {
    this.pullChangesetStmt.finalize();
    this.applyChangesetStmt.finalize();
  }
}

export default async function wrap(
  db: DBSync | DBAsync,
  rx: TblRx
): Promise<DB> {
  const [pullChangesetStmt, applyChangesetStmt, updatePeerTrackerStmt] =
    await Promise.all([
      db.prepare(
        `SELECT "table", "pk", "cid", "val", "col_version", "db_version" FROM crsql_changes WHERE db_version > ? AND site_id IS NULL`
      ),
      db.prepare(
        `INSERT INTO crsql_changes ("table", "pk", "cid", "val", "col_version", "db_version", "site_id") VALUES (?, ?, ?, ?, ?, ?, ?)`
      ),
      db.prepare(
        `INSERT OR REPLACE INTO "crsql_tracked_peers" ("site_id", "event", "version", "seq", "tag") VALUES (?, ?, ?, ?, 0)`
      ),
    ]);

  const ret = new DB(
    db,
    // client-server sync does not use the site id of the client db.
    // we should write something up explaining the problems it avoids to give
    // a client a new uuid on every session.
    // and the requirements that imposes on the server and
    // breaking ties
    uuidv4(),
    rx,
    pullChangesetStmt,
    applyChangesetStmt,
    updatePeerTrackerStmt
  );

  return ret;
}
