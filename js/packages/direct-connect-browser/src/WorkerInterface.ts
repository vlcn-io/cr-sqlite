import {
  Endpoints,
  FromWorkerMsg,
  StartSyncMsg,
  SyncedRemoteMsg,
} from "./Types";
import { DBID } from "@vlcn.io/xplat-api";
import tblrx, { Src } from "@vlcn.io/rx-tbl";

type AsUrls<T> = {
  [Property in keyof T]: T[Property] extends undefined | URL ? undefined : URL;
};
export default class WorkerInterface {
  private readonly worker;
  private readonly syncs = new Map<DBID, ReturnType<typeof tblrx>>();
  private disposables = new Map<string, () => void>();
  private readonly workerPort: {
    onmessage: ((e: MessageEvent<FromWorkerMsg>) => void) | null;
    postMessage: (msg: any) => void;
    close: () => void;
  };

  /**
   *
   * @param workerUri
   * @param isShared use a shared worker or coordinate dedicated workers?
   * Android does not yet support shared workers, hence the option.
   */
  constructor(workerUri?: string, private isShared: boolean = false) {
    if (workerUri && workerUri.includes("shared") && isShared === false) {
      console.warn(
        `You passed in a worker URI that points to a shared worker but asked for a dedicated worker context! workerUri: ${workerUri} isShared: ${isShared}`
      );
    }
    if (workerUri) {
      if (isShared) {
        this.worker = new SharedWorker(workerUri, {
          type: "module",
          name: "direct-connect-browser:shared.worker",
        });
      } else {
        this.worker = new Worker(workerUri, {
          type: "module",
          name: "direct-connect-browser:dedicated.worker",
        });
      }
    } else {
      if (isShared) {
        this.worker = new SharedWorker(
          new URL("./shared.worker.js", import.meta.url),
          {
            type: "module",
            name: "direct-connect-browser:shared.worker",
          }
        );
      } else {
        this.worker = new Worker(
          new URL("./dedicated.worker.js", import.meta.url),
          {
            type: "module",
            name: "direct-connect-browser:dedicated.worker",
          }
        );
      }
    }

    if (isShared) {
      this.workerPort = (this.worker as SharedWorker).port;
    } else {
      const worker = this.worker as Worker;
      this.workerPort = {
        postMessage: (msg: any) => worker.postMessage(msg),
        close: () => worker.terminate(),
        set onmessage(cb: (e: MessageEvent<FromWorkerMsg>) => void) {
          worker.onmessage = cb;
        },
        get onmessage() {
          // @ts-ignore
          return worker.onmessage;
        },
      };
    }

    this.workerPort.onmessage = (e: MessageEvent<FromWorkerMsg>) => {
      const msg = e.data;
      switch (msg._tag) {
        case "SyncedRemote":
          this._onSyncedRemote(msg);
          break;
      }
    };
  }

  startSync(
    wasmUri: string | undefined,
    dbid: DBID,
    endpoints: AsUrls<Endpoints>,
    rx: ReturnType<typeof tblrx>,
    transportContentType:
      | "application/json"
      | "application/octet-stream" = "application/json"
  ) {
    const existing = this.syncs.get(dbid);
    if (existing) {
      throw new Error(`Already syncing ${dbid}`);
    }
    this.syncs.set(dbid, rx);
    const msg = {
      _tag: "StartSync",
      wasmUri,
      dbid,
      endpoints: Object.keys(endpoints).reduce((acc, key) => {
        if ((endpoints as any)[key] == null) {
          return acc;
        }
        (acc as any)[key] = (endpoints as any)[key].toString();
        return acc;
      }, {} as Endpoints),
      transportContentType,
    } as StartSyncMsg;
    this.workerPort.postMessage(msg);

    this.disposables.set(
      dbid,
      // TODO: onAny should tell us if broadcast channel event or not
      // we should ignore broadcast channel events as those tabs will call the shared worker
      // on their own.
      rx.onAny((_updates, src) => this._localDbChanged(dbid, src))
    );
  }

  stopSync(dbid: DBID) {
    const msg = {
      _tag: "StopSync",
      dbid,
    };
    this.workerPort.postMessage(msg);
    this.disposables.get(dbid)?.();
    this.syncs.delete(dbid);
    this.disposables.delete(dbid);
  }

  stopAll() {
    // stop all syncs & close the port
    // this instance can no longer be used after invoking this method
    for (const dbid of this.syncs.keys()) {
      this.stopSync(dbid);
    }
    this.workerPort.close();
  }

  private _onSyncedRemote(msg: SyncedRemoteMsg) {
    const rx = this.syncs.get(msg.dbid);
    if (!rx) {
      console.error(`No rx-tbl instance for ${msg.dbid}`);
      return;
    }

    rx.__internalNotifyListenersAndBroadcast(msg.collectedChanges, "sync");
  }

  private _localDbChanged(dbid: string, src: Src) {
    if (this.isShared) {
      // Shared workers are connected to by all tabs so the tab that made the
      // change would have already notified the shared worker.
      if (src !== "thisTab") {
        return;
      }
    } else {
      // Dedicated workers. We only ignore events from the sync layer.
      // Other tab events we send to our shared worker in case it is our worker that
      // holds the DB sync lock.
      if (src === "sync") {
        return;
      }
    }

    const msg = {
      _tag: "LocalDBChanged",
      dbid,
    };
    this.workerPort.postMessage(msg);
  }
}
