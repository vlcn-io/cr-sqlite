/**
 * A simple reference implementation for a sync server.
 */
// @ts-ignore
import express from "express";
import { IncomingMessage } from "http";
import { WebSocketServer } from "ws";
import * as http from "http";
import { Connection } from "./connection.js";
import logger from "./logger.js";

const port = 8080;
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const server = http.createServer(app);

const wss = new WebSocketServer({ noServer: true });
// const protocol = new Protocol();

wss.on("connection", (ws, request) => {
  logger.log("info", `established ws connection`);

  new Connection(ws);
});

function authenticate(req: IncomingMessage, cb: (err: any) => void) {
  // This function is not defined on purpose. Implement it with your own logic.
  cb(null);
}

server.on("upgrade", (request, socket, head) => {
  authenticate(request, (err) => {
    if (err) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });
});

server.listen(port, () => logger.log("info", `listening on port ${port}!`));
