import type { PartyKitServer } from "partykit/server";
import ConnectionBroker from "./ConnectionBroker.js";
import { decode } from "@vlcn.io/partykit-common";

const connectionBroker = new ConnectionBroker();
export default {
  onConnect(ws, room, _ctx) {
    ws.addEventListener("message", (evt) => {
      const data = evt.data;
      if (typeof data === "string") {
        throw new Error(`Unexpected message ${data}`);
      }
      const msg = decode(new Uint8Array(data));
      connectionBroker.handleMessage(ws, room, msg);
    });
  },
  onClose(ws, room) {
    connectionBroker.close(ws);
  },
  onError(ws, err, room) {
    connectionBroker.close(ws);
  },
} satisfies PartyKitServer;

/**
 * Create with persistence.
 * - Transport...
 * - DB Provider...
 *
 * Similar to client. Can we make it same as client?
 */
function handleMessage() {}
