import { test, expect, afterAll } from "vitest";
import TestConfig from "../../config/TestConfig.js";
import DBCache from "../DBCache.js";
import util from "../util.js";
import SQLiteDB from "better-sqlite3";
import FSNotify from "../FSNotify.js";
import fs from "fs";

test("writes to the database notify fs listeners", async () => {
  const dbid = crypto.randomUUID();
  const db = new SQLiteDB(util.getDbFilename(TestConfig, dbid));
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.exec("CREATE TABLE IF NOT EXISTS test2 (a, b)");
  if (util.isDarwin()) {
    await util.touchFile(TestConfig, dbid);
  }
  await sleep(500);

  const cache = new DBCache(TestConfig);
  console.log("starting notify");
  const fsNotify = new FSNotify(TestConfig, cache);
  let notified = false;
  fsNotify.addListener(dbid, () => {
    notified = true;
  });

  // sleep for some time for fs events to propagate
  await sleep(500);

  // Should not be notified on creation of fsNotify
  expect(notified).toBe(false);

  db.exec("INSERT INTO test2 VALUES (1, 2)");
  if (util.isDarwin()) {
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
