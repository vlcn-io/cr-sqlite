import { IncomingMessage } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import logger from "./logger.js";
import type { Server } from "http";
import DBCache from "./DBCache.js";
import ConnectionBroker from "./ConnectionBroker.js";
import { Config } from "./config.js";

export * from "./config.js";

function noopAuth(req: IncomingMessage, cb: (err: any) => void) {
  cb(null);
}

export function attachWebsocketServer(
  server: Server,
  config: Config,
  authenticate: (
    req: IncomingMessage,
    cb: (err: any) => void
  ) => void = noopAuth
) {
  // warn on multiple instantiations?
  const dbCache = new DBCache(config);
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
        if (config.pathPattern.test(request.url || "")) {
          wss.emit("connection", ws, request);
        }
      });
    });
  });

  wss.on("connection", (ws: WebSocket, request) => {
    logger.info(`Connection opened`);

    const proto = request.headers["sec-websocket-protocol"];
    if (proto == null) {
      throw new Error("Expected sec-websocket-protocol header");
    }
    console.log(proto);
    const entries = proto?.split(",");
    const options: { [key: string]: string } = {};
    for (const entry of entries) {
      const [key, value] = atob(entry).split("=");
      options[key] = value;
    }
    if (!options.room) {
      console.error("Expected to receive a room in the sec-websocket-protocol");
      ws.close();
      return;
    }
    new ConnectionBroker(ws, dbCache, options.room);
  });
}
