import { Changes, tags } from "@vlcn.io/partykit-common";
import DB from "./DB.js";
import Transport from "./Trasnport.js";

/**
 * Processes a stream of changes from the given sender.
 * Sends the sender a rejection if the changes are out of order.
 */
export default class InboundStream {
  readonly #transport;
  readonly #db;
  readonly #from;
  #lastSeen: [bigint, number] | null = null;

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
      excludeSites: [],
      localOnly: true,
      schemaVersion: 0n,
      since: this.#lastSeen,
    });
  }

  receiveChanges(changes: Changes) {
    // check for contiguity
    // apply
  }
}
