import {
  ChangesAckedMsg,
  SiteIdWire,
  Version,
} from "@vlcn.io/client-server-common";
import { DB } from "./DB.js";
import logger from "./logger.js";

const maxOutstandingAcks = 10;
/**
 * Handles the details of tracking a stream of changes we're shipping to the server.
 * Ensures:
 * - correct order of delivery
 * - we don't overwhelm the server by sending too many unacked messages
 * - each message states what message it follows
 *
 * This is accomplished by:
 * - Listening to the local db for changes
 * - Generating changesets from those changes
 * - Encoding them in the expected format
 *
 * TODO: can we merge this implementation and the server implementation?
 */
export default class ChangeStream {
  #started: boolean = false;
  #closed: boolean = false;
  #disposers: (() => void)[] = [];
  #outstandingAcks = 0;
  #blockedSend: boolean = false;
  #lastSeq: [Version, number] = [0, 0];

  constructor(
    private readonly db: DB,
    private readonly ws: WebSocket,
    private readonly remoteDbId: SiteIdWire,
    private readonly create?: {
      schemaName: string;
    }
  ) {}

  async start() {
    if (this.#started) {
      throw new Error("Calling start after already being started");
    }
    this.#started = true;

    // TODO: no-- we need to use rx to collapse updates.
    this.#disposers.push(this.db.onUpdate(this.#localDbChanged));

    // send the establish message

    // send establish meessage
    const seqStart = await this.db.seqIdFor(this.remoteDbId);
    this.#lastSeq = seqStart;
    this.ws.send(
      JSON.stringify({
        _tag: "establish",
        from: this.db.siteId,
        to: this.remoteDbId,
        seqStart,
        create: this.create,
      })
    );

    // kick off sending some data
    this.#localDbChanged();
  }

  async processAck(msg: ChangesAckedMsg) {
    this.#outstandingAcks -= 1;
    if (this.#outstandingAcks < 0) {
      throw new Error("Too many acks received");
    }

    // We just droped below threshold and had previously blocked a send.
    // Can send now.
    if (this.#outstandingAcks == maxOutstandingAcks - 1 && this.#blockedSend) {
      await this.#localDbChanged();
    }
  }

  // TODO: should we throttle to ~50ms?
  #localDbChanged = async () => {
    logger.info("received local db change event");
    if (this.#closed) {
      console.warn("Reciving db change event on closed connection");
      return;
    }

    if (!this.#started) {
      throw new Error("Streaming changes on a connection that has not started");
    }

    if (this.#outstandingAcks == maxOutstandingAcks) {
      this.#blockedSend = true;
      console.warn(
        "Blocked send to server due to too many unacknlowedged messages"
      );
    }
    this.#blockedSend = false;

    const startSeq = this.#lastSeq;
    // TODO: allow chunking of the changeset pulling to handle very large
    // transactions
    const changes = await this.db.pullChangeset(this.remoteDbId, startSeq);
    if (changes.length == 0) {
      return;
    }

    const seqEnd: [Version, number] = [changes[changes.length - 1][4], 0];
    this.#lastSeq = seqEnd;

    this.#outstandingAcks += 1;
    this.ws.send(
      JSON.stringify({
        _tag: "receive",
        changes,
        from: this.db.siteId,
        seqStart: startSeq,
        seqEnd,
      })
    );
  };

  stop() {
    logger.info("stopping change stream");
    this.#started = false;
    this.#closed = true;
    this.#disposers.forEach((d) => d());
  }
}
