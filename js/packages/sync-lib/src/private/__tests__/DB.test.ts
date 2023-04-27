import { test, expect, afterAll } from "vitest";
import DB from "../DB";
import TestConfig from "../../TestConfig";
import fs from "fs";
import util from "../../util";

test("db loads", () => {
  const dbid = crypto.randomUUID();
  const db = new DB(TestConfig, dbid);

  expect(db).toBeDefined();
});

test("db bootstraps with correct dbid", () => {
  const dbid = crypto.randomUUID();
  const db = new DB(TestConfig, dbid);

  expect(
    db.__testsOnly().prepare("SELECT crsql_siteid()").pluck().get()
  ).toEqual(util.uuidToBytes(dbid));
});

test("db can bootstrap a new schema", async () => {
  const dbid = crypto.randomUUID();
  const db = new DB(TestConfig, dbid);

  await db.migrateTo("test.sql", "1");

  const footbl = db
    .__testsOnly()
    .prepare(
      `SELECT name FROM sqlite_master WHERE name = 'foo' AND type = 'table'`
    )
    .pluck()
    .get();
  expect(footbl).toBe("foo");
});

test("migrating to the same schema & version is a no-op", async () => {
  const dbid = crypto.randomUUID();
  const db = new DB(TestConfig, dbid);

  const result1 = await db.migrateTo("test.sql", "1");
  const result2 = await db.migrateTo("test.sql", "1");

  expect(result1).toBe("apply");
  expect(result2).toBe("noop");
});

test("migrating to an unrelated schema is an error", async () => {
  const dbid = crypto.randomUUID();
  const db = new DB(TestConfig, dbid);

  await db.migrateTo("test.sql", "1");

  await expect(db.migrateTo("test2.sql", "1")).rejects.toThrow();
});

test("db can migrate to a new schema", async () => {
  const dbid = crypto.randomUUID();
  const db = new DB(TestConfig, dbid);

  const result1 = await db.migrateTo("test.sql", "1");
  const result2 = await db.migrateTo("test.v2.sql", "2", true);

  expect(result1).toBe("apply");
  expect(result2).toBe("migrate");

  // should have 3 cols now
  expect(() =>
    db.__testsOnly().prepare(`INSERT INTO foo (a, b, c) VALUES (1, 2, 3)`).run()
  ).not.toThrow();
});

test("db can read and write a changeset", async () => {
  const dbid1 = crypto.randomUUID();
  const db1 = new DB(TestConfig, dbid1);
  const dbid2 = crypto.randomUUID();
  const db2 = new DB(TestConfig, dbid2);

  await db1.migrateTo("test.sql", "1");
  await db2.migrateTo("test.sql", "1");
  db1.__testsOnly().exec(`INSERT INTO foo VALUES (1, 2)`);

  const changesFrom1 = [...db1.pullChangeset(util.uuidToBytes(dbid2), 0)];
  db2.applyChanges(util.uuidToBytes(dbid1), changesFrom1);
});

afterAll(() => {
  // remove all files from dbs directory
  const dir = TestConfig.dbsDir;
  fs.readdirSync(dir).forEach((file) => {
    fs.unlinkSync(dir + "/" + file);
  });
});
