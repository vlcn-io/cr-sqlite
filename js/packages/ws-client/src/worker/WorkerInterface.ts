import { Config } from "../config.js";
import { TransporOptions } from "../transport/Transport.js";
import { DBID } from "../types.js";
import { ConfigureMsg, StartSyncMsg, StopSyncMsg } from "./workerMsgTypes.js";

export default class WorkerInterface {
  readonly #worker;
  readonly #syncs = new Set<DBID>();

  constructor(config: Config, workerUri?: string) {
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

    this.#worker.postMessage({
      _tag: "Configure",
      config,
    } satisfies ConfigureMsg);
  }

  startSync(dbid: DBID, transportOpts: TransporOptions) {
    if (this.#syncs.has(dbid)) {
      throw new Error(`Already syncing ${dbid}`);
    }

    this.#syncs.add(dbid);
    this.#worker.postMessage({
      _tag: "StartSync",
      dbid,
      transportOpts,
    } satisfies StartSyncMsg);
  }

  stopSync(dbid: DBID) {
    this.#worker.postMessage({
      _tag: "StopSync",
      dbid,
    } satisfies StopSyncMsg);
  }
}
