import express from "express";
import ViteExpress from "vite-express";
import {
  SyncService,
  DBCache,
  ServiceDB,
} from "@vlcn.io/direct-connect-nodejs";
import { JsonSerializer } from "@vlcn.io/direct-connect-common";

const PORT = process.env.PORT || 8080;

const app = express();
app.use(express.json());

const dbCache = new DBCache();
const svcDb = new ServiceDB(DefaultConfig, false);
const fsNotify = new FSNotify(DefaultConfig, dbCache);
const syncSvc = new SyncService(DefaultConfig, dbCache, svcDb, fsNotify);
const serializer = new JsonSerializer();

app.get("/sync/changes", (req, res) => {
  console.log(req.query);
  res.json({ changes: [] });
});

app.post("/sync/changes", (req, res) => {
  console.log(req.body);
  res.json({});
});

app.post("/sync/create-or-migrate", async (req, res) => {
  const msg = serializer.decode(req.body);
  const ret = await syncSvc.createOrMigrateDatabase(msg);
  res.json(serializer.encode(ret));
});

app.get("/sync/last-seen", (req, res) => {
  console.log(req.query);
  res.json({ lastSeen: 0 });
});

app.post("/sync/start-outbound-stream", (req, res) => {
  console.log(req.body);
  res.json({});
});

ViteExpress.listen(app, PORT, () =>
  console.log(`Listening at http://localhost:${PORT}`)
);
