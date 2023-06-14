import { Port, ToWorkerMsg } from "./Types.js";
import SyncService from "./common/SyncService.js";

const port: Port = {
  postMessage: (msg) => postMessage(msg),
};

const svc = new SyncService();

const locks = new Map<string, () => void>();

self.onmessage = (e: MessageEvent<ToWorkerMsg>) => {
  const msg = e.data;

  switch (msg._tag) {
    case "StartSync": {
      let releaser: (() => void) | null = null;
      const hold = new Promise<void>((resolve, _reject) => {
        releaser = resolve;
      });
      locks.set(msg.dbid, releaser!);
      navigator.locks.request(msg.dbid, () => {
        svc.startSync(msg, port);
        return hold;
      });
      break;
    }
    case "LocalDBChanged":
      // TODO: we should collect all `LocalDBChanged` messages that occur within a short period of time
      // So throttle invocations here or just collect all over a given tick of the event loop.
      svc.localDbChangedFromMainThread(msg);
      break;
    case "StopSync": {
      svc.stopSync(msg, port);
      const releaser = locks.get(msg.dbid);
      if (releaser) {
        releaser();
      }
      break;
    }
  }
};
