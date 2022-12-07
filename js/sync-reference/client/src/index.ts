/**
 * - Connection abstraction
 *  - opens to sync server for a specified dbid
 *  - establish msg includes "since"
 *  - we watch our db and send changes as transactions complete
 */

import wrapDb, { DB } from "./DB.js";
import { SiteIdWire } from "@vlcn.io/client-server-common";
import { DB as DBSync, DBAsync } from "@vlcn.io/xplat-api";
import ChangeStream from "./changeStream.js";

type ReplicatorArgs = {
  localDb: DBSync | DBAsync;
  uri: string;
  remoteDbId: SiteIdWire;
  create?: {
    schemaName: string;
  };
};

class Replicator {
  #ws: WebSocket | null = null;
  #localDb;
  #remoteDbId;
  #create?: {
    schemaName: string;
  };
  #started = false;
  #changeStream: ChangeStream | null = null;
  #uri: string;

  constructor({
    localDb,
    uri,
    remoteDbId,
    create,
  }: {
    localDb: DB;
    uri: string;
    remoteDbId: SiteIdWire;
    create?: {
      schemaName: string;
    };
  }) {
    this.#localDb = localDb;
    this.#remoteDbId = remoteDbId;
    this.#create = create;
    this.#uri = uri;
  }

  start() {
    if (this.#started) {
      throw new Error(
        `Syncing between local db: ${this.#localDb.siteId} and remote db: ${
          this.#remoteDbId
        } has already started`
      );
    }
    this.#started = true;
    this.#ws = new WebSocket(this.#uri);

    this.#ws.onopen = this.#opened;
    this.#ws.onmessage = this.#handleMessage;
    this.#ws.onclose = this.#handleClose;
    // TODO: ping/pong to detect undetectable close events
  }

  #opened = (e: Event) => {
    if (this.#changeStream != null) {
      throw new Error(
        "Change stream already exists for connection that just opened"
      );
    }
    this.#changeStream = new ChangeStream(
      this.#localDb,
      this.#ws!,
      this.#remoteDbId,
      this.#create
    );
    this.#changeStream.start();
  };

  #handleMessage = (e: Event) => {
    // change request should never be received by server.
    // changes received
    console.log(e);

    // handle the various cases

    // receive?
    // apply it
    // ack it

    // request? The server shouldn't request from us.
    // ack? processAck for changeStream
  };

  #handleClose = (e: Event) => {
    if (this.#started) {
      // if the close is not due to us stopping
      // then we should restart the connection
      // via some amount of retries
      // and backoff
    }
    this.stop();
  };

  stop() {
    this.#started = false;
    this.#changeStream?.stop();
    this.#changeStream = null;
    if (this.#ws != null) {
      this.#ws.close();
      this.#ws = null;
    }
  }
}

export default async function startSyncWith(
  args: ReplicatorArgs
): Promise<Replicator> {
  const wrapped = await wrapDb(args.localDb);
  if (wrapped.siteId === args.remoteDbId) {
    throw new Error(
      `Attempting to sync to self? Site ids match? ${wrapped.siteId}`
    );
  }

  const r = new Replicator({
    ...args,
    localDb: wrapped,
  });
  r.start();

  return r;
}
