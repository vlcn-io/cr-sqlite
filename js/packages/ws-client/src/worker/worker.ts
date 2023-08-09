import { Msg } from "./workerMsgTypes.js";
import SyncService from "./SyncService.js";

let syncSvcResolver: (svc: SyncService) => void;
let svcPromise: Promise<SyncService> = new Promise((resolve, reject) => {
  syncSvcResolver = resolve;
});

self.onmessage = (e: MessageEvent<Msg>) => {
  const msg = e.data;

  switch (msg._tag) {
    case "Configure": {
      // TODO
      import(msg.configModule /* @vite-ignore */).then((module) => {
        syncSvcResolver(new SyncService(module.config));
      });
      break;
    }
    case "StartSync": {
      // update the promise so `StopSync` is guaranteed to be called after `StartSync`
      svcPromise = svcPromise.then((svc) => {
        svc.startSync(msg);
        return svc;
      });
      break;
    }
    case "StopSync": {
      svcPromise.then((svc) => svc.stopSync(msg));
      break;
    }
  }
};
