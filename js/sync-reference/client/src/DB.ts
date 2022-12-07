import { SiteIdWire, Version } from "@vlcn.io/client-server-common";
import { DB as DBSync, DBAsync, UpdateType } from "@vlcn.io/xplat-api";

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

  createReplicationTrackingTableIfNotExists() {}

  seqIdFor(siteId: SiteIdWire): [Version, number] {
    return [0, 0];
  }
}

export default async function wrap(db: DBSync | DBAsync): Promise<DB> {
  const r = await db.execA("SELECT crsql_siteid()");
  return new DB(db, r[0][0]);
}
