import DBSyncService from "./DBSyncService";
import DB from "./private/DB";

export default class DBCache {
  private readonly activeDBs = new Map<string, WeakRef<DB>>();
  private readonly finalizationRegistry;

  constructor() {
    this.finalizationRegistry = new FinalizationRegistry((dbid: string) => {
      const ref = this.activeDBs.get(dbid);
      const db = ref?.deref();
      if (db) {
        db.close();
      }
      this.activeDBs.delete(dbid);
    });
  }

  getDb(dbid: string): DB {
    throw new Error();
  }

  destroy() {
    // this.finalizationRegistry.
  }
}
