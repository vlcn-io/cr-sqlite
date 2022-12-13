import { Changeset, SiteIdWire, Version } from "@vlcn.io/client-server-common";
import { DB as DBSync, DBAsync, Stmt, StmtAsync } from "@vlcn.io/xplat-api";
import {
  parse as uuidParse,
  stringify as uuidStringify,
  v4 as uuidv4,
} from "uuid";
import tblrx from "@vlcn.io/rx-tbl";
import { TblRx } from "@vlcn.io/rx-tbl/src/tblrx";
import logger from "./logger";

export const SEND = 0 as const;
export const RECEIVE = 1 as const;
type VersionEvent = typeof RECEIVE | typeof SEND;

// exposes the minimal interface required by the replicator
// to the DB.
export class DB {
  constructor(
    private readonly db: DBSync | DBAsync,
    public readonly siteId: SiteIdWire,
    private readonly rx: TblRx,
    private readonly pullChangesetStmt: Stmt | StmtAsync,
    private readonly applyChangesetStmt: Stmt | StmtAsync,
    private readonly updatePeerTrackerStmt: Stmt | StmtAsync,
    private readonly origSiteId: SiteIdWire
  ) {
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
      "SELECT version, seq FROM __crsql_peers WHERE site_id = ? AND event = ?",
      [parsed, event]
    );
    if (rows.length == 0) {
      // never seen the site before
      return [0, 0];
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
    await this.db.transaction(async () => {
      for (const cs of changes) {
        const v = BigInt(cs[4]);
        // have to run serially given wasm build
        // isn't actually multithreaded
        // TODO: can we optimize by creating 1 giant
        // insert statement with all the values?
        // or at least batch to 100 rows at a time.
        await this.applyChangesetStmt.run(
          cs[0],
          cs[1],
          cs[2],
          cs[3],
          v,
          cs[5] ? uuidParse(cs[5]) : null
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

  async pullChangeset(
    siteId: SiteIdWire,
    seq: [Version, number]
  ): Promise<Changeset[]> {
    logger.info("Pulling changes since ", seq);
    // pull changes since we last sent the server changes,
    // excluding what the server has sent us
    const changes = await this.pullChangesetStmt.all(
      BigInt(seq[0]),
      uuidParse(siteId)
    );
    changes.forEach((c) => {
      c[5] = uuidStringify(c[5] as any);
      if (c[5] === this.origSiteId) {
        c[5] = this.siteId;
      }
      // since BigInt doesn't serialize -- convert to string
      c[4] = c[4].toString();
    });
    return changes;
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
  const r = await db.execA("SELECT crsql_siteid()");

  await db.exec(
    "CREATE TABLE IF NOT EXISTS __crsql_peers (site_id BLOB, event INTEGER, version INTEGER, seq INTEGER, primary key (site_id, event)) STRICT;"
  );

  const [pullChangesetStmt, applyChangesetStmt, updatePeerTrackerStmt] =
    await Promise.all([
      db.prepare(
        `SELECT "table", "pk", "cid", "val", "version", "site_id" FROM crsql_changes WHERE version > ? AND site_id != ?`
      ),
      db.prepare(
        `INSERT INTO crsql_changes ("table", "pk", "cid", "val", "version", "site_id") VALUES (?, ?, ?, ?, ?, ?)`
      ),
      db.prepare(
        `INSERT OR REPLACE INTO "__crsql_peers" ("site_id", "event", "version", "seq") VALUES (?, ?, ?, ?)`
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
    updatePeerTrackerStmt,
    uuidStringify(r[0][0])
  );

  return ret;
}
