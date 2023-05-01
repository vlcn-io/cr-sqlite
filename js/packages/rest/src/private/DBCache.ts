import { Config } from "../Types.js";
import DB from "./DB.js";
import util from "./util.js";

// TODO: have a size limit on the cache?
export default class DBCache {
  private readonly activeDBs = new Map<string, [number, DB]>();
  private readonly intervalHandle: NodeJS.Timeout;

  constructor(
    private readonly config: Config,
    private readonly schemaProvider: (name: string, version: string) => string
  ) {
    this.intervalHandle = setInterval(() => {
      const now = Date.now();
      for (const [dbid, entry] of this.activeDBs.entries()) {
        if (now - entry[0] > config.cacheTtlInSeconds * 1000) {
          entry[1].close();
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
  get(dbid: Uint8Array): DB {
    let dbidStr = util.bytesToHex(dbid);
    return this.getStr(dbidStr);
  }

  getStr(dbidStr: string): DB {
    let entry = this.activeDBs.get(dbidStr);
    if (entry == null) {
      entry = [
        Date.now(),
        new DB(this.config, util.hexToBytes(dbidStr), this.schemaProvider),
      ];
      this.activeDBs.set(dbidStr, entry);
    } else {
      entry[0] = Date.now();
    }

    return entry[1];
  }

  destroy() {
    clearInterval(this.intervalHandle);
    for (const [_, db] of this.activeDBs.values()) {
      try {
        db.close();
      } catch (e) {
        console.error(e);
      }
    }
    this.activeDBs.clear();
  }
}
