import { Endpoints } from "../Types.js";
import InboundStream from "./InboundStream.js";
import OutboundStream from "./OutboundStream.js";

export default class SyncedDB {
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
    this.inboundStream = new InboundStream(dbid, endpoints);
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

  localDbChanged() {
    this.outboundStream.nextTick();
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

/**
 * Startg sync involves:
 * 1. Listening for changes to the local DB
 * 2. Pushing changes out on said events
 * 3. Starting a SSE stream to the remote DB
 */
