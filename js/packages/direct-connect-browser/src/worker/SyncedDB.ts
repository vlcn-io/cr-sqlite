import { Endpoints } from "../Types.js";

export default class SyncedDB {
  private readonly ports: Set<MessagePort>;

  constructor(
    private readonly dbid: string,
    private readonly endpoints: Endpoints
  ) {
    this.ports = new Set();
  }

  // port is for communicating back out to the thread that asked us to start sync
  start(port: MessagePort) {
    this.ports.add(port);
    if (this.ports.size === 1) {
      // start sync
    }
  }

  localDbChanged() {
    // push out changes for the given db
    // to the server we're connected to via endpoints
    // should we also use this to re-broadcast to other tabs?
    // probably... but in that case the tab should not call us back on localDbChanged
    // rx-tbl alrdy does broadcasting for us so we don't need to do anything here
    // since rx-tbl should work indep. of sync.
    // --
    // we do, however, have to broadcast up (to all port) on remote db change / on sync.
    // can we do this thru rx-tbl?
  }

  stop(port: MessagePort): boolean {
    this.ports.delete(port);
    if (this.ports.size === 0) {
      // stop sync
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
