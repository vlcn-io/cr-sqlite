import { Port, ToWorkerMsg } from "./Types.js";
import SyncService from "./common/SyncService.js";

const port: Port = {
  postMessage: (msg) => postMessage(msg),
};

const svc = new SyncService();

const locks = new Map<string, () => void>();
const doesHoldLock = new Map<string, boolean>();

self.onmessage = (e: MessageEvent<ToWorkerMsg>) => {
  const msg = e.data;

  switch (msg._tag) {
    case "StartSync": {
      let releaser: (() => void) | null = null;
      const hold = new Promise<void>((resolve, _reject) => {
        releaser = resolve;
      });
      locks.set(msg.dbid, releaser!);
      doesHoldLock.set(msg.dbid, false);
      navigator.locks.request(msg.dbid, () => {
        doesHoldLock.set(msg.dbid, true);
        svc.startSync(msg, port);
        return hold;
      });
      break;
    }
    case "StopSync": {
      svc.stopSync(msg, port);
      const releaser = locks.get(msg.dbid);
      if (releaser) {
        releaser();
        doesHoldLock.delete(msg.dbid);
      }
      break;
    }
  }
};
