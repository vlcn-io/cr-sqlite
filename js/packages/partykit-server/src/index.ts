import type { PartyKitServer } from "partykit/server";
import ConnectionBroker from "./ConnectionBroker.js";
import { decode } from "@vlcn.io/partykit-common";
import DBCache from "./DBCache.js";
import logger from "./logger.js";

const dbCache = new DBCache();
const connectionBroker = new ConnectionBroker(dbCache);
export default {
  onConnect(ws, room, _ctx) {
    logger.info(`Connection opened for ${ws.id}`);
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
    logger.info(`Connection closed for ${ws.id}`);
    connectionBroker.close(ws);
  },
  onError(ws, err, room) {
    logger.error(err);
    connectionBroker.close(ws);
  },
} satisfies PartyKitServer;
