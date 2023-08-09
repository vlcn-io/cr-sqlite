import { Changes, greaterThanOrEqual, tags } from "@vlcn.io/ws-common";
import DB from "../DB.js";
import Transport from "../Trasnport.js";

/**
 * Processes a stream of changes from the given sender.
 * Sends the sender a rejection if the changes are out of order.
 *
 * TODO: make this isomorphic with the client? It should be the same logic on both sides.
 * Well.. except that on the server our db interface is synchronous.
 */
export default class InboundStream {
  readonly #transport;
  readonly #db;
  readonly #from;
  #lastSeen: readonly [bigint, number] | null = null;

  constructor(transport: Transport, db: DB, from: Uint8Array) {
    this.#transport = transport;
    this.#db = db;
    this.#from = from;
  }

  start() {
    // figure out our last seen from `from`
    // send the request for the client to start streaming
    this.#lastSeen = this.#db.getLastSeen(this.#from);

    // Tell the connected client to start streaming
    this.#transport.startStreaming({
      _tag: tags.StartStreaming,
      excludeSites: [this.#db.siteId],
      localOnly: false,
      since: this.#lastSeen,
    });
  }

  receiveChanges(msg: Changes) {
    // check for contiguity
    // apply
    if (this.#lastSeen == null) {
      throw new Error(
        `Illegal state -- last seen should not be null when receiving changes`
      );
    }

    if (!greaterThanOrEqual(this.#lastSeen, msg.since)) {
      this.#transport.rejectChanges({
        _tag: tags.RejectChanges,
        whose: msg.sender,
        since: this.#lastSeen,
      });
    }

    if (msg.changes.length == 0) {
      return;
    }
    const lastChange = msg.changes[msg.changes.length - 1];
    const newLastSeen = [lastChange[5], 0] as const;
    this.#db.applyChangesetAndSetLastSeen(msg.changes, msg.sender, newLastSeen);
    this.#lastSeen = newLastSeen;
  }
}
