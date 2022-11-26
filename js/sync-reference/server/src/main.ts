/**
 * A simple reference implementation for a sync server.
 */
// @ts-ignore
import express from "express";
import { IncomingMessage } from "http";
import { WebSocketServer } from "ws";
import * as winston from "winston";
import * as http from "http";

const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

const port = 8080;
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const server = http.createServer(app);

const wss = new WebSocketServer({ noServer: true });
wss.on("connection", (ws, request) => {
  logger.log("info", `established ws connection`);

  ws.on("message", (data) => {
    logger.log("info", `Received messages ${data}`);
  });

  ws.on("close", () => {});
});

function authenticate(req: IncomingMessage, cb: (err: any) => void) {
  // if you had auth code...
  cb(null);
}

server.on("upgrade", (request, socket, head) => {
  // This function is not defined on purpose. Implement it with your own logic.
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
