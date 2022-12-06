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
  constructor({ localDb, uri, remoteDbId, schemaName }: ReplicatorArgs) {
    this.#localDb = localDb;
    this.#remoteDbId = remoteDbId;
    this.#ws = new WebSocket(uri);
  }

  start() {
    // create peer table if not exists
    // listen to db for changes
    this.#ws.onopen = this.#opened;
    this.#ws.onmessage = this.#handleMessage;
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
