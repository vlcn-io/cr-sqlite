import { ToWorkerMsg } from "../Types.js";
import SyncService from "./SyncService.js";

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
  // port.start? supposidly implicitly called
};

function msgReceived(e: MessageEvent<ToWorkerMsg>, port: MessagePort) {
  const msg = e.data;

  switch (msg._tag) {
    case "StartSync":
      svc.startSync(msg, port);
      break;
    case "LocalDBChanged":
      // TODO: we should collect all `LocalDBChanged` messages that occur within a short period of time
      // So throttle invocations here or just collect all over a given tick of the event loop.
      svc.localDbChangedFromMainThread(msg);
      break;
    case "StopSync":
      svc.stopSync(msg, port);
      break;
  }
}
