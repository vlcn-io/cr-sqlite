import { Endpoints } from "../Types";
import { DB, Version } from "./DB";
import { SyncedDB } from "./SyncedDB";

export default class InboundStream {
  // from the server into us.
  // we tell the server from where to start.
  // this'll be driven by server sent events.
  // When we apply changes from the inbound stream, ping the connected tabs.
  // TODO: can we apply back-pressure so the server doesn't overwhelm us with sync events?
  private started: boolean = false;
  private shutdown: boolean = false;

  constructor(db: DB, endpoints: Endpoints) {}

  async start() {
    if (this.started || this.shutdown) {
      return;
    }
    this.started = true;

    // ask the server for changes
  }

  stop() {
    this.started = false;
    this.shutdown = true;
  }

  _applyChangeset(seqEnd: readonly [Version, number]) {
    // ensure we're contiguous
    // then update peer tracker / our record of the server
    // await this.updatePeerTracker(tx, from, RECEIVE, seqEnd);
    // then tell synceddb a sync event completed.
    // pass it the collection of table names...
    // or should we depend on `rx-tbl` for this?
  }
}
