import { test, expect } from "vitest";
import FSNotify from "../FSNotify";
import TestConfig from "../../TestConfig";
import DBCache from "../../DBCache";
import util from "../../util";
import SQLiteDB from "better-sqlite3";
import fs from "fs";

test("writes to the database notify fs listeners", async () => {
  const dbid = crypto.randomUUID();
  const db = new SQLiteDB(util.getDbFilename(TestConfig, dbid));
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.exec("CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)");

  const cache = new DBCache(TestConfig);
  const fsNotify = new FSNotify(TestConfig, cache);
  let notified = false;
  fsNotify.addListener(dbid, () => {
    notified = true;
  });

  // sleep for some time for fs events to propagate
  sleep(500);

  // Should not be notified on creation of fsNotify
  expect(notified).toBe(false);

  db.exec("INSERT INTO test VALUES (1, 'test')");

  // sleep for some time for fs events to propagate
  sleep(500);
  // Should be notified on later writes.
  expect(notified).toBe(true);

  fsNotify.shutdown();
  cache.destroy();

  // delete the db file
  fs.unlinkSync(util.getDbFilename(TestConfig, dbid));
});

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
