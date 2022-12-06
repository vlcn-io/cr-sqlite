// After an `establishedConnection` has received a `requestChanges` event
// we start a change stream for that client.

import config from "./config.js";
import { DBType } from "./db.js";
import { EstablishedConnection } from "./establishedConnection.js";
import logger from "./logger.js";
import {
  ChangesAckedMsg,
  ChangesRequestedMsg,
  SiteIdWire,
  Version,
} from "./protocol.js";

// change stream:
// 1. sends the requested changes up till now
// 2. records `endSeq`
// 3. sends from `endSeq` till now on db change events not caused by the client
// pulling changesets filters against the client's id

export default class ChangeStream {
  #begun: boolean = false;
  #closed: boolean = false;
  #disposables: (() => void)[] = [];
  #outstandingAcks = 0;
  #blockedSend: boolean = false;
  #lastSeq: [Version, number] = [0, 0];

  constructor(
    private readonly db: DBType,
    private readonly connection: EstablishedConnection
  ) {
    connection.onClosed = this.#connClosed;
  }

  begin(msg: ChangesRequestedMsg) {
    if (this.#begun) {
      logger.error(`Change stream to ${this.db.siteId} was already started`);
      throw {
        code: "INVALID_MSG_STATE",
      };
    }

    this.#begun = true;
    this.#lastSeq = msg.seqStart;

    this.#disposables.push(this.db.onChanged(this.#dbChanged));
  }

  processAck(msg: ChangesAckedMsg) {
    this.#outstandingAcks -= 1;
    if (this.#outstandingAcks < 0) {
      this.connection.close("INVALID_MSG_STATE", {
        msg: "too many acks received",
      });
    }

    // We just droped below threshold and had previously blocked a send.
    // Can send now.
    if (
      this.#outstandingAcks == config.maxOutstandingAcks - 1 &&
      this.#blockedSend
    ) {
      this.#dbChanged(null);
    }
  }

  #dbChanged(source: SiteIdWire | null) {
    if (this.#closed) {
      // events could have been queued
      logger.info(
        `receiving db changed event on closed connection. DB: ${this.db.siteId}, Peer: ${this.connection.site}`
      );
      return;
    }

    if (!this.#begun) {
      throw new Error(
        `Attemping to stream changes when streaming has not begun for DB: ${this.db.siteId} and Peer: ${this.connection.site}`
      );
    }

    if (source == this.connection.site) {
      logger.info(
        `not syncing self sourced changes to Peer: ${this.connection.site}`
      );
      return;
    }

    if (this.#outstandingAcks == config.maxOutstandingAcks) {
      this.#blockedSend = true;
      logger.info(
        `db changed but Peer: ${this.connection.site} has too many outstanding acks`
      );
      return;
    }

    this.#blockedSend = false;

    // pull changeset
    // based on last seq
    const startSeq = this.#lastSeq;
    // TODO: allow chunking of the changeset pulling to handle very large
    // transactions
    const changes = this.db.pullChangeset(this.connection.site, startSeq);
    if (changes.length == 0) {
      return;
    }

    // TODO: bruh, that is fragile AF that #4
    const seqEnd: [Version, number] = [changes[changes.length - 1][4], 0];
    this.#lastSeq = seqEnd;
    this.#outstandingAcks += 1;

    this.connection.send({
      _tag: "receive",
      changes,
      from: this.db.siteId,
      seqStart: startSeq,
      seqEnd,
    });
  }

  #connClosed = () => {
    logger.info(
      `Closed connection to Peer: ${this.connection.site} for DB: ${this.db.siteId}`
    );
    this.#closed = true;
    this.#disposables.forEach((d) => d());
  };
}
