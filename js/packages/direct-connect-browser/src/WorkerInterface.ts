import { Endpoints, FromWorkerMsg, SyncedRemoteMsg } from "./Types";
import tblrx from "@vlcn.io/rx-tbl";

export default class WorkerInterface {
  private readonly worker;
  private readonly syncs = new Map<string, ReturnType<typeof tblrx>>();
  private ignoreNotif: boolean = false;
  private disposables = new Map<string, () => void>();

  constructor(workerUri: string) {
    this.worker = new SharedWorker(workerUri);

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
      rx.onAny(() => this._localDbChanged(dbid))
    );
  }

  _localDbChanged(dbid: string) {
    if (this.ignoreNotif) {
      console.log("ignoreing changes from sync layer itself");
      return;
    }

    const msg = {
      _tag: "LocalDBChanged",
      dbid,
    };
    this.worker.port.postMessage(msg);
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
    // integrate with the correct rx-tbl instance
    //
    // __internalNotifyListeners
    const rx = this.syncs.get(msg.dbid);
    if (!rx) {
      console.error(`No rx-tbl instance for ${msg.dbid}`);
      return;
    }

    this.ignoreNotif = true;
    try {
      rx.__internalNotifyListeners(msg.collectedChanges);
    } finally {
      this.ignoreNotif = false;
    }
  }
}
