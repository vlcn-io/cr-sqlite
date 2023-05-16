import express from "express";
import ViteExpress from "vite-express";
import {
  SyncService,
  DBCache,
  ServiceDB,
  FSNotify,
  DefaultConfig,
} from "@vlcn.io/direct-connect-nodejs";
import { JsonSerializer } from "@vlcn.io/direct-connect-common";

const PORT = parseInt(process.env.PORT || "8080");

const app = express();
app.use(express.json());

const svcDb = new ServiceDB(DefaultConfig, true);
const dbCache = new DBCache(DefaultConfig, (name, version) => {
  return svcDb.getSchema("default", name, version);
});
const fsNotify = new FSNotify(DefaultConfig, dbCache);
const syncSvc = new SyncService(DefaultConfig, dbCache, svcDb, fsNotify);
const serializer = new JsonSerializer();

app.get("/sync/changes", (req, res) => {
  console.log(req.query);
  res.json({ changes: [] });
});

app.post(
  "/sync/changes",
  makeSafe(async (req, res) => {
    console.log(req.body);
    res.json({});
  })
);

app.post(
  "/sync/create-or-migrate",
  makeSafe(async (req, res) => {
    const msg = serializer.decode(req.body);
    const ret = await syncSvc.createOrMigrateDatabase(msg);
    res.json(serializer.encode(ret));
  })
);

app.get(
  "/sync/last-seen",
  makeSafe(async (req, res) => {
    console.log(req.query);
    res.json({ lastSeen: 0 });
  })
);

app.post(
  "/sync/start-outbound-stream",
  makeSafe(async (req, res) => {
    console.log(req.body);
    res.json({});
  })
);

ViteExpress.listen(app, PORT, () =>
  console.log(`Listening at http://localhost:${PORT}`)
);

function makeSafe(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      console.error(err);
    }
  };
}
