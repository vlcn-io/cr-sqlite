// import type { PartyKitServer } from "partykit/server";
// import ConnectionBroker from "./ConnectionBroker.js";
// import { decode } from "@vlcn.io/ws-common";
// import DBCache from "./DBCache.js";
// import logger from "./logger.js";

// const dbCache = new DBCache();
// const connectionBroker = new ConnectionBroker(dbCache);
// export default {
//   onConnect(ws, room, _ctx) {
//     logger.info(`Connection opened for ${ws.id}`);
//     ws.addEventListener("message", (evt) => {
//       const data = evt.data;
//       if (typeof data === "string") {
//         throw new Error(`Unexpected message ${data}`);
//       }
//       const msg = decode(new Uint8Array(data));
//       connectionBroker.handleMessage(ws, room, msg);
//     });
//   },
//   onClose(ws, room) {
//     logger.info(`Connection closed for ${ws.id}`);
//     connectionBroker.close(ws);
//   },
//   onError(ws, err, room) {
//     logger.error(err);
//     connectionBroker.close(ws);
//   },
// } satisfies PartyKitServer;

import { IncomingMessage } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import logger from "./logger.js";
import type { Server } from "http";

function authenticate(req: IncomingMessage, cb: (err: any) => void) {
  // This function is not defined on purpose. Implement it with your own logic.
  cb(null);
}

export function attachWebsocketServer(server: Server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    logger.info("upgrading to ws connection");
    authenticate(request, (err) => {
      if (err) {
        logger.error("failed to authenticate");
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    });
  });

  wss.on("connection", (ws: WebSocket, request) => {
    logger.info(`Connection opened`);

    new Connection(config.get, new WebSocketWrapper(ws));
  });
}
