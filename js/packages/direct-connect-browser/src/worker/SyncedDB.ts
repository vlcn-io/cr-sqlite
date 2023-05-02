import { Endpoints } from "../Types.js";
import InboundStream from "./InboundStream.js";
import OutboundStream from "./OutboundStream.js";

export class SyncedDB {
  private readonly ports: Set<MessagePort>;
  private syncStarted = false;
  private readonly outboundStream: OutboundStream;
  private readonly inboundStream: InboundStream;

  constructor(
    private readonly dbid: string,
    private readonly endpoints: Endpoints
  ) {
    this.ports = new Set();
    this.outboundStream = new OutboundStream(dbid, endpoints);
    this.inboundStream = new InboundStream(dbid, endpoints, this);
  }

  // port is for communicating back out to the thread that asked us to start sync
  start(port: MessagePort) {
    if (this.syncStarted) {
      return;
    }
    this.syncStarted = true;
    this.ports.add(port);

    this.inboundStream.start();
    this.outboundStream.start();
  }

  localDbChangedFromMainThread() {
    this.outboundStream.nextTick();
  }

  syncApplied() {
    // inbound stream calls this
    // then we fire up the ports to the main threads to tell them to update.
    // we should collect the precise tables that changed and send that info to the main thread
    // we could install rx-tbl inside of here...
    // or we can collect during changeset application...
  }

  stop(port: MessagePort): boolean {
    this.ports.delete(port);
    if (this.ports.size === 0) {
      // stop sync
      this.syncStarted = false;
      return true;
    }

    return false;
  }
}

export default async function createSyncedDB() {}

/**
 * Startg sync involves:
 * 1. Listening for changes to the local DB
 * 2. Pushing changes out on said events
 * 3. Starting a SSE stream to the remote DB
 */
