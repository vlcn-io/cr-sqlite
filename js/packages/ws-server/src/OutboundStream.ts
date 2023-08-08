import {
  RejectChanges,
  bytesToHex,
  tags,
  uintArraysEqual,
} from "@vlcn.io/ws-common";
import DB from "./DB.js";
import Transport from "./Trasnport.js";
import logger from "./logger.js";

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
  // although maybe it should happen here so we can respect back pressure
  // per connection -- https://github.com/cloudflare/workerd/issues/988
  #dbChanged = () => {
    logger.info(`OutboundStream got a db change event`);
    // #to to ignore changes from self.
    const changes = this.#db.pullChangeset(this.#lastSent, this.#to);
    if (changes.length == 0) {
      return;
    }

    const lastChange = changes[changes.length - 1];
    const since = this.#lastSent;
    this.#lastSent = [lastChange[5], 0] as const;

    try {
      this.#transport.sendChanges({
        _tag: tags.Changes,
        changes,
        sender: this.#db.siteId,
        since,
      });
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
