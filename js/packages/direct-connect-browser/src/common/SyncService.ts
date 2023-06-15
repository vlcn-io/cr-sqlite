import { SerializerFactory } from "@vlcn.io/direct-connect-common";
import { Port, StartSyncMsg, StopSyncMsg } from "../Types.js";
import createSyncedDB, { SyncedDB } from "./SyncedDB.js";

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
  async startSync(msg: StartSyncMsg, port: Port) {
    let db = this.dbs.get(msg.dbid);
    if (!db) {
      // TODO: eagerly cache the promise isntead so we can't end up with a race and have the same
      // db created twice.
      db = await createSyncedDB(
        msg.wasmUri,
        msg.dbid,
        msg.endpoints,
        SerializerFactory.getSerializer(msg.transportContentType, [true, false])
      );
      this.dbs.set(msg.dbid, db);
    }

    db.start(port, msg.endpoints);
  }

  stopSync(msg: StopSyncMsg, port: Port) {
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
