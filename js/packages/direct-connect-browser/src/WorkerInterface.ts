import { Endpoints, FromWorkerMsg, SyncedRemoteMsg } from "./Types";
import tblrx, { Src } from "@vlcn.io/rx-tbl";

export default class WorkerInterface {
  private readonly worker;
  private readonly syncs = new Map<string, ReturnType<typeof tblrx>>();
  private disposables = new Map<string, () => void>();

  constructor(workerUri: string) {
    this.worker = new SharedWorker(workerUri, {
      type: "module",
    });

    this.worker.port.onmessage = (e: MessageEvent<FromWorkerMsg>) => {
      const msg = e.data;
      switch (msg._tag) {
        case "SyncedRemote":
          this._onSyncedRemote(msg);
          break;
      }
    };
  }

  startSync(dbid: string, endpoints: Endpoints, rx: ReturnType<typeof tblrx>) {
    const existing = this.syncs.get(dbid);
    if (existing) {
      throw new Error(`Already syncing ${dbid}`);
    }
    this.syncs.set(dbid, rx);
    const msg = {
      _tag: "StartSync",
      dbid,
      endpoints,
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

  stopSync(dbid: string) {
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
    if (src !== "thisTab") {
      console.log("ignoreing changes from sync layer itself");
      return;
    }

    const msg = {
      _tag: "LocalDBChanged",
      dbid,
    };
    this.worker.port.postMessage(msg);
  }
}
