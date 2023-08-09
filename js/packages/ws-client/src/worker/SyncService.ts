import { createAndStartSyncedDB_Exclusive } from "../SyncedDB.js";
import { Config } from "../config.js";
import { StartSyncMsg, StopSyncMsg } from "./workerMsgTypes.js";

/**
 * There should be one instance of this class per application.
 * Create this instance outside of the React lifecylce (if you're using React).
 *
 * Do we need this class?
 */
export default class SyncService {
  /**
   * Map from dbid to SyncedDB
   */
  private readonly dbs = new Map<
    string,
    ReturnType<typeof createAndStartSyncedDB_Exclusive>
  >();

  constructor(private config: Config) {}

  async startSync(msg: StartSyncMsg) {
    const entry = this.dbs.get(msg.dbid);
    if (!entry) {
      const creator = createAndStartSyncedDB_Exclusive(
        this.config,
        msg.dbid,
        msg.transportOpts
      );
      this.dbs.set(msg.dbid, creator);
      await creator;
    } else {
      console.warn(`Already syncing db: ${msg.dbid}`);
      return;
    }
  }

  async stopSync(msg: StopSyncMsg) {
    // decrement reference count for the given db
    // if reference count is 0, stop sync for that db
    // TODO: can we understand when message ports close due to browser tab closing?
    // If we send a msg on a closed channel do we just get an error?
    const handle = this.dbs.get(msg.dbid);
    if (handle) {
      this.dbs.delete(msg.dbid);
      const db = await handle;
      db.stop();
    }
  }
}
