import { GetChangesResponse } from "../Types";
import { Seq } from "../Types";
import DB from "./DB";
import FSNotify from "./FSNotify";

/**
 * We could use this in our p2p setup too.
 * Starts an outbound stream. Streams either all changes made to the db
 * or only local writes that took place on the db.
 */
export default class OutboundStream {
  private readonly listeners = new Set<(changes: GetChangesResponse) => void>();
  constructor(
    private readonly fsnotify: FSNotify,
    toDbid: string,
    private since: Seq,
    type: "LOCAL_WRITES" | "ALL_WRITES" = "ALL_WRITES"
  ) {}

  start() {
    this.fsnotify.addListener(this.toDbid, this.#dbChanged);
  }

  #dbChanged = (db: DB) => {
    // pull changeset from db
    // update since
    // notify listeners of this outbound stream
    db.getChanges(this.since[0]);
  };

  // registers with FSNotify
  // emits events which includes changes.
  // update since.
  // if receiver ends up out of order, receiver should tear down sse stream
  // and restart it.
  close() {
    this.fsnotify.removeListener(this.toDbid, this.#dbChanged);
  }
}
