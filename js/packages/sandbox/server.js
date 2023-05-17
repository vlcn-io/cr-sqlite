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

app.post(
  "/sync/changes",
  makeSafe(async (req, res) => {
    const msg = serializer.decode(req.body);
    const ret = await syncSvc.applyChanges(msg);
    res.json(serializer.encode(ret));
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
  "/sync/start-outbound-stream",
  makeSafe(async (req, res) => {
    console.log("Start outbound stream");
    const msg = serializer.decode(
      JSON.parse(decodeURIComponent(req.query.msg))
    );
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // TODO: just throw on schema mismatch rather than providing a response
    const [stream, initialResponse] = await syncSvc.startOutboundStream(msg);
    res.write(
      `data: ${JSON.stringify(serializer.encode(initialResponse))}\n\n`
    );

    stream.addListener((changes) => {
      res.write(
        `data: ${JSON.stringify(serializer.encode(changes))}\n\n`,
        (err) => {
          if (err != null) {
            console.error(err);
            stream.close();
          }
        }
      );
    });

    req.on("close", () => {
      console.log("Close outbound stream");
      stream.close();
    });
  })
);

ViteExpress.listen(app, PORT, () =>
  console.log(`Listening at http://localhost:${PORT}`)
);

/**
 *
 * @param {import("express").RequestHandler} handler
 * @returns {import("express").RequestHandler}
 */
function makeSafe(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  };
}
