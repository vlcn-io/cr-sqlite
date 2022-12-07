/**
 * - Connection abstraction
 *  - opens to sync server for a specified dbid
 *  - establish msg includes "since"
 *  - we watch our db and send changes as transactions complete
 */

export type SiteIdWire = string;
type TODO = any;

type ReplicatorArgs = {
  localDb: TODO;
  uri: string;
  remoteDbId: SiteIdWire;
  schemaName: string;
};

class Replicator {
  #ws: WebSocket;
  #localDb;
  #remoteDbId;
  #started = false;

  constructor({ localDb, uri, remoteDbId, schemaName }: ReplicatorArgs) {
    this.#localDb = localDb;
    this.#remoteDbId = remoteDbId;
    this.#ws = new WebSocket(uri);
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

    this.#localDb.createReplicationTrackingTable();
  }

  #opened = (e: Event) => {
    // look what version we have for the remote already

    const seqStart = [0, 0];

    // send establish meessage
    this.#ws.send(
      JSON.stringify({
        _tag: "establish",
        from: this.#localDb.siteId,
        to: this.#remoteDbId,
        seqStart,
      })
    );
  };

  #handleMessage = (e: Event) => {
    // change request should never be received by server.
    // changes received
  };

  stop() {}
}

export default function startSyncWith(args: ReplicatorArgs): Replicator {
  const r = new Replicator(args);
  r.start();

  return r;
}
