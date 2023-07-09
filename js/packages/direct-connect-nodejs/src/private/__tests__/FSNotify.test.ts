import { test, expect, afterAll } from "vitest";
import TestConfig from "../../config/TestConfig.js";
import DBCache from "../DBCache.js";
import util from "../util.js";
import SQLiteDB from "better-sqlite3";
import FSNotify from "../FSNotify.js";
import ServiceDB from "../ServiceDB.js";
import { bytesToHex } from "@vlcn.io/direct-connect-common";

test("writes to the database notify fs listeners", async () => {
  const uuid = crypto.randomUUID();
  const dbid = util.uuidToBytes(uuid);
  const dbidStr = bytesToHex(dbid);
  const db = new SQLiteDB(util.getDbFilename(TestConfig, dbid));
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.exec("CREATE TABLE IF NOT EXISTS test2 (a, b)");
  if (util.needsTouchHack()) {
    await util.touchFile(TestConfig, dbid);
  }
  await sleep(500);

  const sdb = new ServiceDB(TestConfig, true);
  const cache = new DBCache(TestConfig, (name, version) =>
    sdb.getSchema("ns", name, version)
  );
  console.log("starting notify");
  const fsNotify = new FSNotify(TestConfig, cache);
  let notified = false;
  fsNotify.addListener(dbidStr, () => {
    notified = true;
  });

  // sleep for some time for fs events to propagate
  await sleep(500);

  // Should be notified on first registration of listener to fsnotify.
  expect(notified).toBe(true);

  db.exec("INSERT INTO test2 VALUES (1, 2)");
  if (util.needsTouchHack()) {
    await util.touchFile(TestConfig, dbid);
  }

  // sleep for some time for fs events to propagate
  await sleep(500);
  // Should be notified on later writes.
  expect(notified).toBe(true);

  fsNotify.shutdown();
  cache.destroy();
});

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
