import { Msg } from "./workerMsgTypes.js";
import SyncService from "./SyncService.js";

let svc: SyncService | null = null;
const locks = new Map<string, () => void>();
const doesHoldLock = new Map<string, boolean>();

self.onmessage = (e: MessageEvent<Msg>) => {
  const msg = e.data;

  switch (msg._tag) {
    case "Configure": {
      svc = new SyncService(msg.config);
      break;
    }
    case "StartSync": {
      svc!.startSync(msg);
      break;
    }
    case "StopSync": {
      svc!.stopSync(msg);
      break;
    }
  }
};
