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
  localDb: DBSync | DBAsync;
  uri: string;
  remoteDbId: Uint8Array;
  rx: TblRx;
  create?: {
    schemaName: string;
  };
};

export class Replicator {
  #ws: Socket | null = null;
  #localDb;
  #remoteDbId;
  #create?: {
    schemaName: string;
  };
  #started = false;
  #changeStream: ChangeStream | null = null;

  #expectedSeq?: readonly [Version, number];

  constructor({
    localDb,
    remoteDbId,
    create,
  }: {
    localDb: DB;
    remoteDbId: Uint8Array;
    create?: {
      schemaName: string;
    };
  }) {
    this.#localDb = localDb;
    this.#remoteDbId = remoteDbId;
    this.#create = create;
  }

  start(socket: Socket) {
    logger.info("starting replicator");
    if (this.#started) {
      throw new Error(
        `Syncing between local db: ${this.#localDb.siteId} and remote db: ${
          this.#remoteDbId
        } has already started`
      );
    }
    this.#started = true;
    this.#ws = socket;

    this.#opened();
    this.#ws.onmessage = this.#handleMessage;
    this.#ws.onclose = this.#handleClose;
    // TODO: ping/pong to detect undetectable close events
  }

  #opened = () => {
    logger.info("Opened connection");
    if (this.#changeStream != null) {
      throw new Error(
        "Change stream already exists for connection that just opened"
      );
    }
    this.#localDb.seqIdFor(this.#remoteDbId, RECEIVE).then((seq) => {
      this.#expectedSeq = seq;
      this.#changeStream = new ChangeStream(
        this.#localDb,
        this.#ws!,
        this.#remoteDbId,
        this.#create
      );
      this.#changeStream.start();
    });
  };

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
    this.#localDb.applyChangeset(this.#remoteDbId, data.changes, data.seqEnd);
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
    if (this.#started) {
      // if the close is not due to us stopping
      // then we should restart the connection
      // via some amount of retries
      // and backoff
      this.#stop();

      // TODO: schedule a reconnect
    } else {
      this.#stop();
    }
  };

  #stop() {
    logger.info("Stopping replicator");
    this.#started = false;
    this.#changeStream?.stop();
    this.#changeStream = null;
    if (this.#ws != null) {
      this.#ws.closeForError();
      this.#ws = null;
    }
  }

  dispose() {
    this.#stop();
    this.#localDb.dispose();
  }
}

export default async function createReplicator(
  args: ReplicatorArgs
): Promise<Replicator> {
  const wrapped = await wrapDb(args.localDb, args.rx);
  const r = new Replicator({
    ...args,
    localDb: wrapped,
  });

  return r;
}
