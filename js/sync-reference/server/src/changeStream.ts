// After an `establishedConnection` has received a `requestChanges` event
// we start a change stream for that client.

import { DBType } from "./db.js";
import { EstablishedConnection } from "./establishedConnection.js";
import logger from "./logger.js";
import { ChangesAckedMsg, ChangesRequestedMsg } from "./protocol.js";

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

    this.#disposables.push(this.db.onChanged(this.#dbChanged));
  }

  processAck(msg: ChangesAckedMsg) {}

  #dbChanged() {
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
  }

  #connClosed = () => {
    logger.info(
      `Closed connection to Peer: ${this.connection.site} for DB: ${this.db.siteId}`
    );
    this.#closed = true;
    this.#disposables.forEach((d) => d());
  };
}
