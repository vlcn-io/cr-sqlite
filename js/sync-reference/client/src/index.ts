/**
 * - Connection abstraction
 *  - opens to sync server for a specified dbid
 *  - establish msg includes "since"
 *  - we watch our db and send changes as transactions complete
 */

import wrapDb, { DB } from "./DB.js";
import { SiteIdWire } from "@vlcn.io/client-server-common";
import { DB as DBSync, DBAsync } from "@vlcn.io/xplat-api";

type ReplicatorArgs = {
  localDb: DBSync | DBAsync;
  uri: string;
  remoteDbId: SiteIdWire;
  create?: {
    schemaName: string;
  };
};

class Replicator {
  #ws: WebSocket;
  #localDb;
  #remoteDbId;
  #create?: {
    schemaName: string;
  };
  #started = false;
  #disposers: (() => void)[] = [];

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
    this.#ws = new WebSocket(uri);
    this.#create = create;
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

    this.#ws.onopen = this.#opened;
    this.#ws.onmessage = this.#handleMessage;
    this.#ws.onclose = this.#handleClose;
    // TODO: ping/pong to detect undetectable close events

    this.#localDb.createReplicationTrackingTableIfNotExists();

    this.#disposers.push(this.#localDb.onUpdate(this.#localDbChanged));
  }

  #opened = (e: Event) => {
    // look what version we have for the remote already

    const seqStart = this.#localDb.seqIdFor(this.#remoteDbId);

    // send establish meessage
    this.#ws.send(
      JSON.stringify({
        _tag: "establish",
        from: this.#localDb.siteId,
        to: this.#remoteDbId,
        seqStart,
        create: this.#create,
      })
    );
  };

  #localDbChanged = () => {
    // listen to RX for changes
    // replicate those changes
    // ensure we don't listen to changes applied due to sync.
    // the whole db replicator uses the sync bit --
    // select crsql_wdbreplicator() WHERE crsql_internal_sync_bit() = 0;
    // but we want to sync post tx..
    // well we can pull from changes where != server... a little duplicative.
    // we can throttle the replication
    // - 100ms intervals
    // - 10 outstanding acks
    //
    // if we want to ensure we omit sync changes
    // then we need to extend our commit hook callback to provide sync bit information.
    //
    // invoke our changeStream?
  };

  #handleMessage = (e: Event) => {
    // change request should never be received by server.
    // changes received
    console.log(e);

    // remember to ack it
    // remember to incr / decr outstanding acks
    //
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
    this.#ws.close();
    this.#disposers.forEach((d) => d());
  }
}

export default async function startSyncWith(
  args: ReplicatorArgs
): Promise<Replicator> {
  const wrapped = await wrapDb(args.localDb);
  const r = new Replicator({
    ...args,
    localDb: wrapped,
  });
  r.start();

  return r;
}
