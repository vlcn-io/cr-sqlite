#!/usr/bin/env node
import express from "express";
import { IncomingMessage } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import * as http from "http";
import { Connection, logger, contextStore } from "@vlcn.io/server-core";
import { nanoid } from "nanoid";
import yargs from "yargs/yargs";
import { hideBin } from "yargs/helpers";
import config, { configure } from "../config.js";
import WebSocketWrapper from "../WebSocketWrapper.js";

const argv = yargs(hideBin(process.argv)).argv;

console.log(argv);
configure(argv as any);

const port = process.env.PORT || 8080;
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
if ((argv as any).static) {
  app.use(express.static((argv as any).static));
}

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

wss.on("connection", (ws: WebSocket, request) => {
  logger.info("info", `established ws connection`, {
    event: "main.establish",
    req: contextStore.get().reqId,
  });

  new Connection(config.get, new WebSocketWrapper(ws));
});

function authenticate(req: IncomingMessage, cb: (err: any) => void) {
  // This function is not defined on purpose. Implement it with your own logic.
  cb(null);
}

server.on("upgrade", (request, socket, head) => {
  contextStore.run(
    {
      reqId: nanoid(),
    },
    () => {
      logger.info("upgrading to ws connection", {
        event: "main.upgrade",
        req: contextStore.get().reqId,
      });
      authenticate(request, (err) => {
        if (err) {
          logger.error("failed to authenticate", {
            event: "auth",
            req: contextStore.get().reqId,
          });
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }

        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit("connection", ws, request);
        });
      });
    }
  );
});

server.listen(port, () => logger.log("info", `listening on port ${port}!`));
