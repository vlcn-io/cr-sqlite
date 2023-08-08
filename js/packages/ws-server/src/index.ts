import { IncomingMessage } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import logger from "./logger.js";
import type { Server } from "http";
import DBCache from "./DBCache.js";
import ConnectionBroker from "./ConnectionBroker.js";

function noopAuth(req: IncomingMessage, cb: (err: any) => void) {
  cb(null);
}

export function attachWebsocketServer(
  server: Server,
  authenticate: (
    req: IncomingMessage,
    cb: (err: any) => void
  ) => void = noopAuth
) {
  const wss = new WebSocketServer({ noServer: true });
  const dbCache = new DBCache();

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

    const proto = request.headers["sec-websocket-protocol"];
    if (proto == null) {
      throw new Error("Expected sec-websocket-protocol header");
    }
    const entries = proto?.split(";");
    const options: { [key: string]: string } = {};
    for (const entry of entries) {
      const [key, value] = entry.split("=");
      options[key] = value;
    }
    if (!options.room) {
      throw new Error(
        "Expected to receive a room in the sec-websocket-protocol"
      );
    }
    new ConnectionBroker(ws, dbCache, options.room);
  });
}
