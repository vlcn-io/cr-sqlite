import { Changeset, SiteIdWire, Version } from "@vlcn.io/client-server-common";
import { DB as DBSync, DBAsync, UpdateType } from "@vlcn.io/xplat-api";
import { parse as uuidParse } from "uuid";

// exposes the minimal interface required by the replicator
// to the DB.
export class DB {
  constructor(
    private readonly db: DBSync | DBAsync,
    public readonly siteId: SiteIdWire
  ) {
    if (!this.siteId) {
      throw new Error(`Unable to fetch site id from the local db`);
    }
  }

  onUpdate(
    cb: (
      type: UpdateType,
      dbName: string,
      tblName: string,
      rowid: bigint
    ) => void
  ) {
    return this.db.onUpdate(cb);
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

  pullChangeset(siteId: SiteIdWire, seq: [Version, number]): Changeset[] {
    return [];
  }
}

export default async function wrap(db: DBSync | DBAsync): Promise<DB> {
  const r = await db.execA("SELECT crsql_siteid()");
  const ret = new DB(db, r[0][0]);

  await db.exec(
    "CREATE TABLE IF NOT EXISTS __crsql_peers (site_id PRIMARY KEY, version INTEGER, seq INTEGER) STRICT;"
  );

  return ret;
}
