import { Changeset, SiteIdWire, Version } from "@vlcn.io/client-server-common";
import { DB as DBSync, DBAsync, Stmt, StmtAsync } from "@vlcn.io/xplat-api";
import { parse as uuidParse, stringify as uuidStringify } from "uuid";
import tblrx from "@vlcn.io/rx-tbl";
import { TblRx } from "@vlcn.io/rx-tbl/src/tblrx";

// exposes the minimal interface required by the replicator
// to the DB.
export class DB {
  constructor(
    private readonly db: DBSync | DBAsync,
    public readonly siteId: SiteIdWire,
    private readonly rx: TblRx,
    private readonly pullChangesetStmt: Stmt | StmtAsync,
    private readonly applyChangesetStmt: Stmt | StmtAsync
  ) {
    if (!this.siteId) {
      throw new Error(`Unable to fetch site id from the local db`);
    }
  }

  onUpdate(cb: () => void) {
    return this.rx.on(cb);
  }

  async seqIdFor(siteId: SiteIdWire): Promise<[Version, number]> {
    const parsed = uuidParse(siteId);
    const rows = await this.db.execA(
      "SELECT version, seq FROM __crsql_peers WHERE site_id = ?",
      [parsed]
    );
    if (rows.length == 0) {
      // never seen the site before
      return [0, 0];
    }
    const row = rows[0];

    // handle possible bigint return
    return [row[0].toString(), row[1]];
  }

  async applyChangeset(from: SiteIdWire, changes: Changeset[]) {
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
    });
  }

  async pullChangeset(
    siteId: SiteIdWire,
    seq: [Version, number]
  ): Promise<Changeset[]> {
    const changes = await this.pullChangesetStmt.all(
      uuidParse(siteId),
      BigInt(seq[0])
    );
    changes.forEach((c) => {
      // idk -- can we not keep this as an array buffer?
      c[5] = uuidStringify(c[5] as any);
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

  const pullChangesetStmt = await db.prepare(
    `SELECT "table", "pk", "cid", "val", "version", "site_id" FROM crsql_changes WHERE version > ? AND site_id != ?`
  );
  const applyChangesetStmt = await db.prepare(
    `INSERT INTO crsql_changes ("table", "pk", "cid", "val", "version", "site_id") VALUES (?, ?, ?, ?, ?, ?)`
  );

  const ret = new DB(db, r[0][0], rx, pullChangesetStmt, applyChangesetStmt);

  await db.exec(
    "CREATE TABLE IF NOT EXISTS __crsql_peers (site_id BLOB PRIMARY KEY, version INTEGER, seq INTEGER) STRICT;"
  );

  return ret;
}
