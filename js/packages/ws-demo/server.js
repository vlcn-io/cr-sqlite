#!/usr/bin/env node

import * as http from "http";
import { attachWebsocketServer } from "@vlcn.io/ws-server";
import express from "express";

const port = process.env.PORT || 8080;

const app = express();
const server = http.createServer(app);

attachWebsocketServer(server, {
  dbFolder: "./dbs",
  schemaFolder: "./src/schemas",
  pathPattern: /\/sync/,
});

server.listen(port, () => console.log("info", `listening on port ${port}!`));
