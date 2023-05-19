import { DBID, Endpoints, FromWorkerMsg, SyncedRemoteMsg } from "./Types";
import tblrx, { Src } from "@vlcn.io/rx-tbl";

type AsUrls<T> = {
  [Property in keyof T]: T[Property] extends undefined | URL ? undefined : URL;
};
export default class WorkerInterface {
  private readonly worker;
  private readonly syncs = new Map<DBID, ReturnType<typeof tblrx>>();
  private disposables = new Map<string, () => void>();

  constructor(workerUri: string, private readonly wasmUri: string) {
    if ((import.meta as any).env?.DEV) {
      this.worker = new SharedWorker(new URL(workerUri, import.meta.url), {
        type: "module",
        name: "direct-connect-browser:shared.worker",
      });
    } else {
      this.worker = new SharedWorker(
        new URL("./worker/shared.worker.js", import.meta.url),
        {
          type: "module",
          name: "direct-connect-browser:shared.worker",
        }
      );
    }

    this.worker.port.onmessage = (e: MessageEvent<FromWorkerMsg>) => {
      const msg = e.data;
      switch (msg._tag) {
        case "SyncedRemote":
          this._onSyncedRemote(msg);
          break;
      }
    };
  }

  startSync(
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
      dbid,
      endpoints: Object.keys(endpoints).reduce((acc, key) => {
        (acc as any)[key] = (endpoints as any)[key].toString();
        return acc;
      }, {} as Endpoints),
      wasmUri: this.wasmUri,
      transportContentType,
    };
    this.worker.port.postMessage(msg);

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
    this.worker.port.postMessage(msg);
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
    this.worker.port.close();
  }

  private _onSyncedRemote(msg: SyncedRemoteMsg) {
    const rx = this.syncs.get(msg.dbid);
    if (!rx) {
      console.error(`No rx-tbl instance for ${msg.dbid}`);
      return;
    }

    rx.__internalNotifyListeners(msg.collectedChanges, "sync");
  }

  private _localDbChanged(dbid: string, src: Src) {
    // console.log("db change event", src);
    if (src !== "thisTab") {
      // console.log("ignoring changes from sync layer itself", src);
      return;
    }

    const msg = {
      _tag: "LocalDBChanged",
      dbid,
    };
    this.worker.port.postMessage(msg);
  }
}
