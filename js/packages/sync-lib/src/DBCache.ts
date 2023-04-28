import { Config } from "./Types.js";
import DB from "./private/DB.js";

// TODO: have a size limit on the cache?
export default class DBCache {
  private readonly activeDBs = new Map<string, DB>();
  private readonly intervalHandle: NodeJS.Timeout;

  constructor(private readonly config: Config) {
    this.intervalHandle = setInterval(() => {
      const now = Date.now();
      for (const [dbid, db] of this.activeDBs.entries()) {
        if (now - db.lastUsed > config.cacheTtlInSeconds * 1000) {
          // This would present problems if someone has a reference to the
          // db they just so happen to be using at the time it gets evicted.
          // You should:
          // 1. Stick it into a finalization registry
          // 2. Only close and truly evict from the cache when the DB is garbage collected.
          // 3. Use of the DB while in that registry should re-insert it into the cache.
          db.close();
          this.activeDBs.delete(dbid);
        }
      }
    }, config.cacheTtlInSeconds * 1000);
  }

  __testsOnly() {
    return this.activeDBs;
  }

  /**
   * DBCache evicts after some TTL. Thus users should not hold onto
   * references to DBs for long periods of time. Instead, they should
   * get a DB from the cache, do their work, and then release it.
   * @param dbid
   * @returns
   */
  get(dbid: string): DB {
    let db = this.activeDBs.get(dbid);
    if (db == null) {
      db = new DB(this.config, dbid);
      this.activeDBs.set(dbid, db);
    } else {
      db.lastUsed = Date.now();
    }

    return db;
  }

  destroy() {
    clearInterval(this.intervalHandle);
    for (const db of this.activeDBs.values()) {
      try {
        db.close();
      } catch (e) {
        console.error(e);
      }
    }
    this.activeDBs.clear();
  }
}
