import { ISerializer, hexToBytes, tags } from "@vlcn.io/direct-connect-common";
import { Endpoints, Port } from "../Types.js";
import { DBID } from "@vlcn.io/xplat-api";
import createDb, { DB } from "./DB.js";
import InboundStream from "./InboundStream.js";
import OutboundStream from "./OutboundStream.js";
import Fetcher from "./Fetcher.js";
import tblrx from "@vlcn.io/rx-tbl";
import { UpdateType } from "@vlcn.io/xplat-api";

export class SyncedDB {
  private readonly ports: Set<Port>;
  private syncStarted = false;
  private readonly outboundStream: OutboundStream;
  private readonly inboundStream: InboundStream;
  private shutdown = false;
  private readonly fetcher: Fetcher;
  private rx: ReturnType<typeof tblrx>;

  constructor(
    private readonly db: DB,
    private readonly endpoints: Endpoints,
    serializer: ISerializer
  ) {
    this.ports = new Set();
    this.outboundStream = new OutboundStream(db, endpoints, serializer);
    this.inboundStream = new InboundStream(db, endpoints, serializer);
    this.fetcher = new Fetcher(endpoints, serializer);
    this.rx = tblrx(this.db.db);
    this.rx.onAny((updates, src) => {
      if (src !== "thisProcess") {
        this.localDbChangedFromOtherProcess();
      }
    });
  }

  // port is for communicating back out to the thread that asked us to start sync
  async start(port: Port, endpoints: Endpoints) {
    if (!shallowCompare(this.endpoints, endpoints)) {
      throw new Error(
        "A DB can only be synced to one backend at a time. Submit a PR if you'd like to lift this restriction."
      );
    }
    if (this.shutdown) {
      return;
    }
    this.ports.add(port);
    if (this.syncStarted) {
      return;
    }
    this.syncStarted = true;

    const createOrMigrateResp = await this.fetcher.createOrMigrate({
      _tag: tags.createOrMigrate,
      dbid: hexToBytes(this.db.remoteDbid),
      requestorDbid: hexToBytes(this.db.localDbid),
      schemaName: this.db.schemaName,
      schemaVersion: this.db.schemaVersion,
    });

    this.inboundStream.start();
    this.outboundStream.start(createOrMigrateResp.seq);
  }

  localDbChangedFromOtherProcess() {
    this.outboundStream.nextTick();
  }

  async stop(port: Port): Promise<boolean> {
    this.ports.delete(port);
    if (this.ports.size === 0) {
      // stop sync
      this.syncStarted = false;
      this.shutdown = true;
      this.outboundStream.stop();
      this.inboundStream.stop();
      this.rx?.dispose();
      await this.db.close();
      return true;
    }

    return false;
  }
}

export default async function createSyncedDB(
  wasmUri: string | undefined,
  dbid: DBID,
  endpoints: Endpoints,
  serializer: ISerializer
) {
  const db = await createDb(wasmUri, dbid);
  return new SyncedDB(db, endpoints, serializer);
}

/**
 * Startg sync involves:
 * 1. Listening for changes to the local DB
 * 2. Pushing changes out on said events
 * 3. Starting a SSE stream to the remote DB
 */

const shallowCompare = (
  obj1: { [key: string]: any },
  obj2: { [key: string]: any }
) =>
  Object.keys(obj1).length === Object.keys(obj2).length &&
  Object.keys(obj1).every((key) => obj1[key] === obj2[key]);
