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
  private readonly syncs = new Set<DBID>();
  private readonly workerPort: {
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
      };
    }
  }

  startSync(
    wasmUri: string | undefined,
    dbid: DBID,
    endpoints: AsUrls<Endpoints>,
    transportContentType:
      | "application/json"
      | "application/octet-stream" = "application/json"
  ) {
    const existing = this.syncs.has(dbid);
    if (existing) {
      throw new Error(`Already syncing ${dbid}`);
    }
    this.syncs.add(dbid);
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
  }

  stopSync(dbid: DBID) {
    const msg = {
      _tag: "StopSync",
      dbid,
    };
    this.workerPort.postMessage(msg);
    this.syncs.delete(dbid);
  }

  stopAll() {
    // stop all syncs & close the port
    // this instance can no longer be used after invoking this method
    for (const dbid of this.syncs.keys()) {
      this.stopSync(dbid);
    }
    this.workerPort.close();
  }
}
