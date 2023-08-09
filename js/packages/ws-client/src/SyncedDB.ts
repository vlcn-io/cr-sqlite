import { tags } from "@vlcn.io/ws-common";
import type { Config } from "./config.js";
import InboundStream from "./streams/InboundStream.js";
import OutboundStream from "./streams/OutboundStream.js";
import { Transport } from "./transport/Transport.js";
import { DB } from "./DB.js";
import { TransporOptions } from "./transport/Transport.js";

export interface ISyncedDB {
  start(): Promise<void>;
  stop(): boolean;
}

class SyncedDB implements ISyncedDB {
  readonly #transport;
  readonly #inboundStream;
  readonly #outboundStream;
  readonly #db;

  constructor(db: DB, transport: Transport) {
    this.#db = db;
    this.#transport = transport;
    this.#inboundStream = new InboundStream(db, transport);
    this.#outboundStream = new OutboundStream(db, transport);
    this.#transport.onChangesReceived = this.#inboundStream.receiveChanges;
    this.#transport.onStartStreaming = this.#outboundStream.startStreaming;
    // If a peer rejects our changes we may need to restart at some prior version
    this.#transport.onResetStream = this.#outboundStream.resetStream;
  }

  // TODO: acquire navigation lock on site id or db name?
  // so we only have a single tab syncing the same db at the same time.
  // or single worker.
  async start() {
    const lastSeens = await this.#db.getLastSeens();
    const [schemaName, schemaVersion] =
      await this.#db.getSchemaNameAndVersion();
    // Prepare the inbound stream to receive changes from upstreams
    this.#inboundStream.prepare(lastSeens);

    this.#transport.start(() => {
      // Announce our presence that we're ready to start receiving and sending changes
      this.#transport.announcePresence({
        _tag: tags.AnnouncePresence,
        lastSeens,
        schemaName,
        schemaVersion,
        sender: this.#db.siteid,
      });
    });
  }

  stop() {
    this.#outboundStream.stop();
    this.#transport.close();
    return true;
  }
}

export async function createSyncedDB(
  config: Config,
  dbname: string,
  transportOptions: TransporOptions
): Promise<ISyncedDB> {
  const db = await config.dbProvider(dbname);
  const transport = config.transportProvider(transportOptions);
  return new SyncedDB(db, transport);
}

/**
 * Ensures that only one tab or worker is syncing the DB at a time.
 * As soon as a tab or worker dies, then the next tab or worker will
 * be able to sync the DB.
 * @param dbname
 * @param transportOptions
 */
export async function createAndStartSyncedDB_Exclusive(
  config: Config,
  dbname: string,
  transportOptions: TransporOptions
): Promise<{
  stop: () => void;
}> {
  let stopRequested = false;
  let db: ISyncedDB | null = null;
  let releaser: (() => void) | null = null;
  const hold = new Promise<void>((resolve, _reject) => {
    releaser = resolve;
  });

  navigator.locks.request(dbname, () => {
    if (stopRequested) {
      return;
    }
    startSync(config, dbname, transportOptions, (db: ISyncedDB) => {
      if (stopRequested) {
        return false;
      }
      db = db;
      return true;
    });
    return hold;
  });

  return {
    stop: () => {
      stopRequested = true;
      releaser!();
      if (db) {
        db.stop();
      }
    },
  };
}

function startSync(
  config: Config,
  dbname: string,
  transportOptions: TransporOptions,
  cb: (db: ISyncedDB) => boolean
) {
  createSyncedDB(config, dbname, transportOptions).then((db) => {
    if (cb(db)) {
      db.start();
    }
  });
}
