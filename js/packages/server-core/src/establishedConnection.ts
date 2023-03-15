import ChangeStream from "./changeStream.js";
import { Connection, ConnectionCodeKey } from "./connection.js";
import { DBType } from "./db.js";
import {
  ChangesAckedMsg,
  ChangesReceivedMsg,
  ChangesRequestedMsg,
  Msg,
  Version,
} from "@vlcn.io/client-server-common";
import logger from "./logger.js";

export class EstablishedConnection {
  #changeStream?: ChangeStream;
  #expectedSeq?: readonly [Version, number];

  constructor(
    private readonly connection: Connection,
    private readonly db: DBType
  ) {
    /**
     * We should ask client for `changes since` since we last saw them.
     *
     * No. Clients will send us changes since they last saw us.
     *
     * This is more resillient to people who end up copying database files around
     * and create duplicative site ids.
     */
  }

  get site(): Uint8Array {
    return this.connection.site;
  }

  get siteStr(): string {
    return this.connection.siteStr;
  }

  processMsg(data: Msg) {
    /**
     * Client will ask us for `changes since`
     * which will then kick off the stream
     */
    switch (data._tag) {
      case "ack":
        this.#trackAck(data);
        return;
      case "receive":
        // apply changes received
        this.#applyChanges(data);
        return;
      case "request":
        this.#changesRequested(data);
        return;
      case "establish":
        throw {
          code: "INVALID_MSG_STATE",
        };
    }
  }

  #applyChanges(data: ChangesReceivedMsg) {
    if (this.#expectedSeq) {
      const start = data.seqStart;
      if (
        start[0] > this.#expectedSeq[0] ||
        (start[0] > this.#expectedSeq[0] && start[1] != this.#expectedSeq[1])
      ) {
        logger.error(
          `Out of order deliver from ${this.connection.site}. start: ${
            start[0]
          }, expected: ${this.#expectedSeq[0]} b: ${
            start[0] > this.#expectedSeq[0]
          }`
        );
        throw {
          code: "OUT_OF_ORDER_DELIVERY",
        };
      }
    }

    logger.debug(
      `Applying changes from ${this.connection.site} len ${data.changes.length}`
    );
    logger.debug(`start: ${data.seqStart[0]} end: ${data.seqEnd[0]}`);

    this.db.applyChangeset(this.connection.site, data.changes);
    this.#expectedSeq = data.seqEnd;

    this.connection.send({
      _tag: "ack",
      seqEnd: data.seqEnd,
    });
  }

  send(data: Msg) {
    this.connection.send(data);
  }

  #trackAck(data: ChangesAckedMsg) {
    if (!this.#changeStream) {
      throw {
        code: "INVALID_MSG_STATE",
      };
    }

    this.#changeStream.processAck(data);
  }

  #changesRequested(data: ChangesRequestedMsg) {
    // If we've already set up the change stream then
    // the client should not re-request changes.
    if (this.#changeStream) {
      throw {
        code: "INVALID_MSG_STATE",
      };
    }

    this.#changeStream = new ChangeStream(this.db, this);
    this.#changeStream.begin(data);
  }

  close(code: ConnectionCodeKey, data?: Object) {
    this.connection.close(code, data);
  }

  set onClosed(cb: () => void) {
    if (this.connection.onClosed) {
      throw new Error(
        "Trying to register onClosed on a connection that already has a listener"
      );
    }

    this.connection.onClosed = cb;
  }
}

// connection pool we can notify of db change events
