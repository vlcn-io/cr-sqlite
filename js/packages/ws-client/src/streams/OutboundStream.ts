import { StartStreaming, tags } from "@vlcn.io/ws-common";
import { Transport } from "../transport/Transport.js";
import { DB } from "../DB.js";

export default class OutboundStream {
  readonly #db;
  readonly #transport;
  #lastSent: readonly [bigint, number] | null = null;
  #excludeSites: readonly Uint8Array[] = [];
  #localOnly: boolean = false;
  #timeoutHandle: number | null = null;
  #bufferFullBackoff = 50;
  readonly #disposer;

  constructor(db: DB, transport: Transport) {
    this.#db = db;
    this.#transport = transport;
    this.#disposer = this.#db.onChange(this.#dbChanged);
  }

  startStreaming = async (msg: StartStreaming) => {
    this.#lastSent = msg.since;
    this.#excludeSites = msg.excludeSites;
    this.#localOnly = msg.localOnly;
    // initial kickoff so we don't wait for a db change event
    this.#dbChanged();
  };

  resetStream = async (msg: StartStreaming) => {
    this.startStreaming(msg);
  };

  // TODO: ideally we get throttle information from signals from the rest of the system.
  // Should throttle be here or something that the user would be expected to set up?
  // Ideally we can let them control it so they can make the responsiveness tradeoffs they want.
  #dbChanged = async () => {
    if (this.#lastSent == null) {
      return;
    }
    if (this.#timeoutHandle != null) {
      clearTimeout(this.#timeoutHandle);
      this.#timeoutHandle = null;
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

    if (changes.length == 0) {
      return;
    }
    const lastChange = changes[changes.length - 1];
    this.#lastSent = [lastChange[5], 0];

    // console.log(`Sending ${changes.length} changes since ${this.#lastSent}`);

    try {
      const didSend = this.#transport.sendChanges({
        _tag: tags.Changes,
        changes,
        sender: this.#db.siteid,
        since: lastSent,
      });
      // buffer full or reconnecting. Try again later.
      switch (didSend) {
        case "sent":
          this.#bufferFullBackoff = 50;
          break;
        case "buffer-full":
          this.#lastSent = lastSent;
          this.#timeoutHandle = setTimeout(
            this.#dbChanged,
            (this.#bufferFullBackoff = Math.max(
              this.#bufferFullBackoff * 2,
              1000
            ))
          );
          break;
        case "reconnecting":
          this.#lastSent = lastSent;
          this.#timeoutHandle = setTimeout(this.#dbChanged, 3000);
          break;
      }
    } catch (e) {
      this.#lastSent = lastSent;
      throw e;
    }
  };

  // stop listening to the base DB
  stop() {
    this.#disposer();
  }
}
