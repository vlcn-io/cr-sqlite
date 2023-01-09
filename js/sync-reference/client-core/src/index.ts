/**
 * - Connection abstraction
 *  - opens to sync server for a specified dbid
 *  - establish msg includes "since"
 *  - we watch our db and send changes as transactions complete
 */

import wrapDb, { DB, RECEIVE } from "./DB.js";
import {
  ChangesReceivedMsg,
  decodeMsg,
  encodeMsg,
  Msg,
  Socket,
  Version,
} from "@vlcn.io/client-server-common";
import { DB as DBSync, DBAsync } from "@vlcn.io/xplat-api";
import ChangeStream from "./changeStream.js";
import { TblRx } from "@vlcn.io/rx-tbl";
import logger from "./logger.js";

export type ReplicatorArgs = {
  /**
   * Pointer to the local database which we need to sync with the server
   */
  localDb: DBSync | DBAsync;
  /**
   * Site id of the remote database.
   * Can be any valid uuid. If the DB does not exists on the server
   * some servers will create it for you.
   */
  remoteDbId: Uint8Array;
  /**
   * The reactivity extensions such that we can listen
   * for changes to our local database and ship
   * those changes off to the server.
   */
  rx: TblRx;
  /**
   * Optional field. If filled in it should supply the schema name
   * for the server to use when auto-creating a database. The schema
   * name refers to a file on the server which contains the SQL statements
   * required to initialize the database.
   */
  create?: {
    schemaName: string;
  };
};

/**
 * Handles listening to our local database for changes and then shipping those changes
 * off to the server.
 *
 * Also listens for inbound changes from the server and applies them
 * to the local datatbase.
 *
 * The replicator can be started, stopped and then re-started.
 *
 * You should call `start` after the socket has established a connection
 * to the server.
 *
 * Any sort of heartbeating to keep the connection alive or close the connection
 * should be handled within the Socket implementation. If the underlying socket disconnects and
 * needs to reconnect, call `start` again with the newly connected socket.
 */
export class Replicator {
  #ws: Socket | null = null;
  #localDb: DB | null = null;
  #remoteDbId;
  #create?: {
    schemaName: string;
  };
  #started = false;
  #changeStream: ChangeStream | null = null;

  #expectedSeq?: readonly [Version, number];

  constructor(private readonly args: ReplicatorArgs) {
    this.#remoteDbId = args.remoteDbId;
    this.#create = args.create;
  }

  /**
   * Start the replicator. This should be called after the socket has been opened and cannot be called
   * again until the replicator has been stopped.
   */
  async start(socket: Socket) {
    logger.info("starting replicator");
    if (this.#started) {
      throw new Error(
        `Syncing between local db: ${this.#localDb?.siteId} and remote db: ${
          this.#remoteDbId
        } has already started`
      );
    }
    this.#started = true;
    this.#ws = socket;

    await this.#opened();
    this.#ws.onmessage = this.#handleMessage;
    this.#ws.onclose = this.#handleClose;
  }

  async #opened() {
    logger.info("Opened connection");
    if (this.#changeStream != null) {
      throw new Error(
        "Change stream already exists for connection that just opened"
      );
    }

    const db = await wrapDb(this.args.localDb, this.args.rx);
    this.#localDb = db;
    // We could have been closed while awaiting the DB to open
    if (!this.#started) {
      this.stop();
      return;
    }

    // What changes have we recorded having seen from the remote?
    const seq = await this.#localDb.seqIdFor(this.#remoteDbId, RECEIVE);
    this.#expectedSeq = seq;
    // We could have been closed while fetching the seqid
    if (!this.#started) {
      this.stop();
      return;
    }

    // Start up our outbound change stream
    this.#changeStream = new ChangeStream(
      db,
      this.#ws!,
      this.#remoteDbId,
      this.#create
    );
    await this.#changeStream.start();
  }

  #handleMessage = (data: Uint8Array) => {
    logger.info("Received message");

    let msg: Msg | null = null;
    try {
      msg = decodeMsg(data);
    } catch (err) {
      logger.error("Failed to parse msg");
      throw err;
    }

    if (msg == null) {
      logger.error("Message decoded to null");
      throw new Error("Message decoded to null");
    }

    switch (msg._tag) {
      case "ack":
        if (!this.#changeStream) {
          logger.error("received an ack with no allocated change stream");
          this.#ws?.closeForError();
        }
        this.#changeStream?.processAck(msg);
        return;
      case "establish":
        logger.error("unexpected establish message");
        this.#ws?.closeForError();
        return;
      case "receive":
        this.#applyChanges(msg);
        return;
      case "request":
        logger.error("unespected request message");
        return;
    }
    logger.error("unexpected message type", (msg as any)._tag);
  };

  #applyChanges(data: ChangesReceivedMsg) {
    const expected = this.#expectedSeq;
    if (!expected) {
      logger.error(
        "received changes but did not allocated an expected seq number"
      );
      this.#ws?.closeForError();
      return;
    }

    const start = data.seqStart;
    if (
      start[0] > expected[0] ||
      (start[0] > expected[0] && start[1] != expected[1])
    ) {
      logger.error("out of order delivery from server", start, expected);
      this.#ws?.closeForError();
    }

    logger.debug("applying changes from server. Len: ", data.changes.length);
    this.#localDb!.applyChangeset(this.#remoteDbId, data.changes, data.seqEnd);
    this.#expectedSeq = data.seqEnd;

    this.#ws?.send(
      encodeMsg({
        _tag: "ack",
        seqEnd: data.seqEnd,
      })
    );
  }

  #handleClose = (code: number, reason: any) => {
    logger.info("Received close", code, reason);
    this.#ws = null;
    this.stop();
  };

  /**
   * Stop the replicator. This is call automatically by the `onclose` event
   * of the socket but may also be called manually.
   *
   * Calling this will close the socket if it has not already been closed.
   */
  stop() {
    logger.info("Stopping replicator");
    this.#started = false;
    this.#changeStream?.stop();
    this.#changeStream = null;
    this.#ws?.close();
    this.#ws = null;
    this.#localDb?.dispose();
    this.#localDb = null;
  }
}

export default function createReplicator(args: ReplicatorArgs): Replicator {
  return new Replicator(args);
}
