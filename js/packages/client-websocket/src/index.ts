import {
  ReplicatorArgs,
  default as createReplicator,
} from "@vlcn.io/client-core";
import WebSocketWrapper from "./WebSocketWrapper.js";

export { uuidStrToBytes } from "@vlcn.io/client-server-common";
import { uuidStrToBytes } from "@vlcn.io/client-server-common";
import { Init, Msg, RequestSync } from "./messageTypes.js";
import { TblRx } from "@vlcn.io/rx-tbl";

type Overwrite<T, U> = Pick<T, Exclude<keyof T, keyof U>> & U;

export default async function startSyncWith(
  uri: string,
  args: Overwrite<
    ReplicatorArgs,
    { remoteDbId: Uint8Array | string; rx: TblRx }
  > & { workerUri?: string }
): Promise<{ stop: () => void }> {
  const parsedArgs = {
    ...args,
    remoteDbId:
      typeof args.remoteDbId == "string"
        ? uuidStrToBytes(args.remoteDbId)
        : args.remoteDbId,
  };

  // worker must explicitly be false to disable
  if (args.workerUri) {
    if (args.localDb.filename === ":memory:") {
      throw new Error(
        "In-memory databases cannot be accessed from a web-worker and must be synced in the main thread. Set worker: false in the replicator args"
      );
    }
    return startSyncInWorker(uri, parsedArgs);
  }

  const replicator = await createReplicator(parsedArgs);
  const wrapper = new WebSocketWrapper(uri, replicator, args.accessToken);
  wrapper.start();
  return replicator;
}

function startSyncInWorker(
  uri: string,
  args: Overwrite<ReplicatorArgs, { rx: TblRx }> & { workerUri?: string }
) {
  const disposables: (() => void)[] = [];

  const worker = new Worker(
    args.workerUri || new URL("./worker.js", import.meta.url),
    {
      type: "module",
    }
  );

  const dbname = args.localDb.filename;

  const initMsg: Init = {
    _tag: "init",
    uri,
    dbname,
    remoteDbId: args.remoteDbId,
    create: args.create,
    accessToken: args.accessToken,
  };
  worker.postMessage(initMsg);

  let ignoreNotif = false;
  worker.onmessage = (e) => {
    const msg = e.data as Msg;
    switch (msg._tag) {
      case "db_change":
        // todo: test this ignoreNotif logic so it doesn't break (e.g., by new microtask enqueueing) in the future.
        ignoreNotif = true;
        // tell rx about the changes from a different connection
        try {
          args.rx.__internalNotifyListeners(msg.collectedChanges);
        } finally {
          ignoreNotif = false;
        }
        break;
    }
  };

  disposables.push(
    args.rx.onAny(() => {
      // ignore changes coming from the sync layer itself.
      // This is because RX calls into sync layer telling it there was a change.
      // But if change came from sync layer  itself, we don't need to tell sync layer this.
      if (ignoreNotif) {
        console.log("ignoring changes from sync layer itself");
        return;
      }

      // request a sync otherwise
      const msg: RequestSync = { _tag: "request_sync" };
      worker.postMessage(msg);
    })
  );

  return {
    stop: () => {
      // Is this good enough?
      disposables.forEach((d) => d());
      worker.terminate();
    },
  };
}
