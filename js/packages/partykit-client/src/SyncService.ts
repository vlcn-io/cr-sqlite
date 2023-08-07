import { StartSyncMsg, StopSyncMsg } from "./worker/workerMsgTypes";
import SyncedDB from "./SyncedDB";
import { Port } from "./types";

export default class SyncService {
  /**
   * Map from dbid to SyncedDB
   */
  private readonly dbs = new Map<string, SyncedDB>();

  /**
   * Host windows request the shared worker to start sync for a given DB.
   * If sync is already started for that DB, we increment a reference count for interested parties
   * and register that party to receive db change callbacks on sync application.
   * @param dbid
   * @param endpoints
   * @param port Used to communicate back out to the thread that created this service
   */
  async startSync(dbName: string, transport: Transport) {
    let db = this.dbs.get(msg.dbid);
    if (!db) {
      // TODO: eagerly cache the promise instead so we can't end up with a race and have the same
      // db created twice.
      db = await createSyncedDB(msg.dbid);
      this.dbs.set(msg.dbid, db);
    } else {
      console.warn(`Already syncing db: ${msg.dbid}`);
    }

    db.start(port);
  }

  stopSync(msg: StopSyncMsg) {
    // decrement reference count for the given db
    // if reference count is 0, stop sync for that db
    // TODO: can we understand when message ports close due to browser tab closing?
    // If we send a msg on a closed channel do we just get an error?
    const db = this.dbs.get(msg.dbid);
    if (db?.stop(port)) {
      this.dbs.delete(msg.dbid);
    }
  }
}
