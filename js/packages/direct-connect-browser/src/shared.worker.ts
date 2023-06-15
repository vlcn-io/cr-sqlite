import { ToWorkerMsg } from "./Types.js";
import SyncService from "./common/SyncService.js";

type Self = {
  onconnect: (event: MessageEvent) => void;
};
const glob = self as unknown as Self;

const svc = new SyncService();

/**
 * A shared worker that is responsible for syncing databases to other direct-connect
 * instances.
 */
glob.onconnect = (e: MessageEvent) => {
  const port = e.ports[0];
  port.onmessage = (e) => {
    msgReceived(e, port);
  };
};

function msgReceived(e: MessageEvent<ToWorkerMsg>, port: MessagePort) {
  const msg = e.data;

  switch (msg._tag) {
    case "StartSync":
      svc.startSync(msg, port);
      break;
    case "StopSync":
      svc.stopSync(msg, port);
      break;
  }
}
