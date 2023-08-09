import {
  RejectChanges,
  bytesToHex,
  tags,
  uintArraysEqual,
} from "@vlcn.io/ws-common";
import DB from "../DB.js";
import Transport from "../Trasnport.js";
import logger from "../logger.js";

/**
 * Listens to the local db and sends out a stream
 * of changes over the transport.
 */
export default class OutboundStream {
  readonly #db;
  readonly #transport;
  readonly #to: Uint8Array;
  #disposer: (() => void) | null = null;
  #closed = false;
  #lastSent: readonly [bigint, number];
  #bufferFullBackoff = 50;
  #timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  constructor(
    transport: Transport,
    db: DB,
    lastSeenByClient: readonly [Uint8Array, [bigint, number]][],
    clientDbId: Uint8Array
  ) {
    logger.info(
      `Starting outbound stream from ${bytesToHex(db.siteId)} to ${bytesToHex(
        clientDbId
      )}`
    );
    this.#transport = transport;
    this.#db = db;
    this.#to = clientDbId;
    const lastSent = lastSeenByClient.find((v) =>
      uintArraysEqual(v[0], db.siteId)
    );
    this.#lastSent = (lastSent && lastSent[1]) || [0n, 0];
    if (lastSent == null) {
      logger.info(
        `Unable to find existing last sent for ${bytesToHex(db.siteId)}`
      );
    }
  }

  start() {
    if (this.#closed) {
      throw new Error(`Illegal state -- OutboundStream has been closed`);
    }
    this.#disposer = this.#db.onChange(this.#dbChanged);
    // initial kickoff
    this.#dbChanged();
  }

  reset(msg: RejectChanges) {
    // the peer rejected our changes.
    // re-wind our stream back.
  }

  // db change notifications are already throttled for us in `DB.ts`
  // but we also apply some backpressure if the outbound buffer is full.
  #dbChanged = () => {
    logger.info(`OutboundStream got a db change event`);
    if (this.#timeoutHandle != null) {
      clearTimeout(this.#timeoutHandle);
      this.#timeoutHandle = null;
    }
    // #to to ignore changes from self.
    const changes = this.#db.pullChangeset(this.#lastSent, this.#to);
    if (changes.length == 0) {
      return;
    }

    const lastChange = changes[changes.length - 1];
    const since = this.#lastSent;
    this.#lastSent = [lastChange[5], 0] as const;

    try {
      const didSend = this.#transport.sendChanges({
        _tag: tags.Changes,
        changes,
        sender: this.#db.siteId,
        since,
      });
      switch (didSend) {
        case "sent":
          this.#bufferFullBackoff = 50;
          break;
        case "buffer-full":
          this.#lastSent = since;
          this.#timeoutHandle = setTimeout(
            this.#dbChanged,
            (this.#bufferFullBackoff = Math.max(
              this.#bufferFullBackoff * 2,
              1000
            ))
          );
          break;
      }
    } catch (e) {
      this.#lastSent = since;
      throw e;
    }
  };

  stop() {
    if (this.#disposer) {
      this.#disposer();
    }
    this.#closed = true;
  }
}
