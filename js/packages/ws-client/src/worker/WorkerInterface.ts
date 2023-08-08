import { DBID } from "../types.js";
import { StartSyncMsg, StopSyncMsg } from "./workerMsgTypes.js";

export default class WorkerInterface {
  readonly #worker;
  readonly #syncs = new Set<DBID>();

  constructor(workerUri?: string) {
    if (workerUri) {
      this.#worker = new Worker(workerUri, {
        type: "module",
        name: "ws-sync",
      });
    } else {
      this.#worker = new Worker(new URL("./worker.js", import.meta.url), {
        type: "module",
        name: "ws-sync",
      });
    }
  }

  startSync(dbid: DBID, partyOpts: { host: string; room: string }) {
    if (this.#syncs.has(dbid)) {
      throw new Error(`Already syncing ${dbid}`);
    }

    this.#syncs.add(dbid);
    this.#worker.postMessage({
      _tag: "StartSync",
      dbid,
      partyOpts,
    } as StartSyncMsg);
  }

  stopSync(dbid: DBID) {
    this.#worker.postMessage({
      _tag: "StopSync",
      dbid,
    } as StopSyncMsg);
  }
}
