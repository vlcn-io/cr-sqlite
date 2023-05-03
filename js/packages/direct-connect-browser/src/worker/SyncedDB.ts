import { DBID, Endpoints } from "../Types.js";
import createDb, { DB } from "./DB.js";
import InboundStream from "./InboundStream.js";
import OutboundStream from "./OutboundStream.js";

export class SyncedDB {
  private readonly ports: Set<MessagePort>;
  private syncStarted = false;
  private readonly outboundStream: OutboundStream;
  private readonly inboundStream: InboundStream;
  private shutdown = false;

  constructor(private readonly db: DB, private readonly endpoints: Endpoints) {
    this.ports = new Set();
    this.outboundStream = new OutboundStream(db, endpoints);
    this.inboundStream = new InboundStream(db, endpoints);
  }

  // port is for communicating back out to the thread that asked us to start sync
  // TODO: it is an error to try to sync the same db to many endpoints.
  // Raise an exception if this happens.
  start(port: MessagePort, endpoints: Endpoints) {
    if (!shallowCompare(this.endpoints, endpoints)) {
      throw new Error(
        "A DB can only be synced to one backend at a time. Submit a PR if you'd like to lift this restriction."
      );
    }
    if (this.shutdown) {
      return;
    }
    this.ports.add(port);
    if (this.syncStarted) {
      return;
    }
    this.syncStarted = true;

    this.inboundStream.start();
    this.outboundStream.start();
  }

  localDbChangedFromMainThread() {
    this.outboundStream.nextTick();
  }

  _syncApplied() {
    // inbound stream calls this
    // then we fire up the ports to the main threads to tell them to update.
    // we should collect the precise tables that changed and send that info to the main thread
    // we could install rx-tbl inside of here...
    // or we can collect during changeset application...
  }

  async stop(port: MessagePort): Promise<boolean> {
    this.ports.delete(port);
    if (this.ports.size === 0) {
      // stop sync
      this.syncStarted = false;
      this.shutdown = true;
      this.outboundStream.stop();
      this.inboundStream.stop();
      await this.db.close();
      return true;
    }

    return false;
  }
}

export default async function createSyncedDB(dbid: DBID, endpoints: Endpoints) {
  const db = await createDb(dbid);
  return new SyncedDB(db, endpoints);
}

/**
 * Startg sync involves:
 * 1. Listening for changes to the local DB
 * 2. Pushing changes out on said events
 * 3. Starting a SSE stream to the remote DB
 */

const shallowCompare = (
  obj1: { [key: string]: any },
  obj2: { [key: string]: any }
) =>
  Object.keys(obj1).length === Object.keys(obj2).length &&
  Object.keys(obj1).every((key) => obj1[key] === obj2[key]);
