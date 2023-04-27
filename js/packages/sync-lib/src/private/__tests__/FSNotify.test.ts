import { test, expect, afterAll } from "vitest";
import { createFsNotify } from "../FSNotify.js";
import TestConfig from "../../TestConfig.js";
import DBCache from "../../DBCache.js";
import util from "../../util.js";
import SQLiteDB from "better-sqlite3";
import fs from "fs";

test("writes to the database notify fs listeners", async () => {
  const dbid = crypto.randomUUID();
  const db = new SQLiteDB(util.getDbFilename(TestConfig, dbid));
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)");

  const cache = new DBCache(TestConfig);
  const fsNotify = await createFsNotify(TestConfig, cache);
  let notified = false;
  fsNotify.addListener(dbid, () => {
    notified = true;
  });

  // sleep for some time for fs events to propagate
  await sleep(500);

  // Should not be notified on creation of fsNotify
  expect(notified).toBe(false);

  db.exec("INSERT INTO test VALUES (1, 'test')");

  // sleep for some time for fs events to propagate
  await sleep(3000);
  // Should be notified on later writes.
  expect(notified).toBe(true);

  fsNotify.shutdown();
  cache.destroy();
});

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

afterAll(() => {
  // remove all files from dbs directory
  // const dir = TestConfig.dbsDir;
  // fs.readdirSync(dir).forEach((file) => {
  //   fs.unlinkSync(dir + "/" + file);
  // });
});
