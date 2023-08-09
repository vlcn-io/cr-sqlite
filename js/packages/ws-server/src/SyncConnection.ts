import {
  AnnouncePresence,
  Changes,
  RejectChanges,
  bytesToHex,
} from "@vlcn.io/ws-common";
import DBCache from "./DBCache.js";
import OutboundStream from "./streams/OutboundStream.js";
import InboundStream from "./streams/InboundStream.js";
import Transport from "./Trasnport.js";
import logger from "./logger.js";

/**
 *
 */
export default class SyncConnection {
  readonly #db;
  readonly #dbCache;
  readonly #room;
  readonly #outboundStream;
  readonly #inboundStream;

  constructor(
    dbCache: DBCache,
    transport: Transport,
    room: string,
    msg: AnnouncePresence
  ) {
    logger.info(
      `Spun up a sync connection on room ${room} to client ws and client dbid ${bytesToHex(
        msg.sender
      )}`
    );
    this.#dbCache = dbCache;
    this.#db = dbCache.getAndRef(room, msg.schemaName, msg.schemaVersion);
    this.#room = room;

    this.#outboundStream = new OutboundStream(
      transport,
      this.#db,
      msg.lastSeens,
      msg.sender
    );
    this.#inboundStream = new InboundStream(transport, this.#db, msg.sender);
  }

  start() {
    logger.info(`Starting SyncConnection`);
    this.#inboundStream.start();
    this.#outboundStream.start();
  }

  receiveChanges(changes: Changes) {
    logger.info(`Sync connection received changes`);
    this.#inboundStream.receiveChanges(changes);
  }

  changesRejected(rejection: RejectChanges) {
    logger.warn(
      `Sync connection has rejected changes. Resetting outbound stream.`
    );
    this.#outboundStream.reset(rejection);
  }

  close() {
    logger.info(`Sync connection closed`);
    this.#outboundStream.stop();
    // tell the cache we're done. It'll close the db on 0 references.
    this.#dbCache.unref(this.#room);
  }
}
