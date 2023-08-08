import { StartStreaming, tags } from "@vlcn.io/partykit-common";
import { DB } from "../config.js";
import { Transport } from "../transport/Transport.js";

export default class OutboundStream {
  #db;
  #transport;
  #lastSent: [bigint, number] | null = null;
  #excludeSites: Uint8Array[] = [];
  #localOnly: boolean = false;
  #disposer;

  constructor(db: DB, transport: Transport) {
    this.#db = db;
    this.#transport = transport;
    this.#disposer = this.#db.onChange(this.#dbChanged);
  }

  async startStreaming(msg: StartStreaming) {
    this.#lastSent = msg.since;
    this.#excludeSites = msg.excludeSites;
    this.#localOnly = msg.localOnly;
  }

  async resetStream(msg: StartStreaming) {
    this.startStreaming(msg);
  }

  // TODO: throttle invocations so as not to sync more than every 50ms or some such
  async #dbChanged() {
    if (this.#lastSent == null) {
      return;
    }

    // save off last sent so we can detect a reset that happened while pulling changes.
    const lastSent = this.#lastSent;

    const changes = await this.#db.pullChangeset(
      lastSent,
      this.#excludeSites,
      this.#localOnly
    );
    if (lastSent != this.#lastSent) {
      // we got reset. Abort.
      return;
    }

    await this.#transport.sendChanges({
      _tag: tags.Changes,
      changes,
      sender: this.#db.siteid,
      since: lastSent,
    });
  }

  // stop listening to the base DB
  stop() {
    this.#disposer();
  }
}
