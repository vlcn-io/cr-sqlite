import { test, expect, beforeAll } from "vitest";
import DB from "../DB";
import TestConfig from "../../config/TestConfig";
import util from "../util";
import ServiceDB from "../ServiceDB";

let sdb: ServiceDB;

beforeAll(() => {
  sdb = new ServiceDB(TestConfig, true);
  sdb.addSchema(
    "ns",
    "test.sql",
    1n,
    `CREATE TABLE foo (a primary key, b);
      SELECT crsql_as_crr('foo');`,
    true
  );
});

test("db loads", () => {
  const dbid = util.uuidToBytes(crypto.randomUUID());
  const db = new DB(TestConfig, dbid, (name, version) =>
    sdb.getSchema("ns", name, version)
  );

  expect(db).toBeDefined();
});

test("db bootstraps with correct dbid", () => {
  const dbid = util.uuidToBytes(crypto.randomUUID());
  const db = new DB(TestConfig, dbid, (name, version) =>
    sdb.getSchema("ns", name, version)
  );

  const dbidFromDb = db
    .__testsOnly()
    .prepare("SELECT crsql_site_id()")
    .pluck()
    .get();
  expect(Uint8Array.from(dbidFromDb as any)).toEqual(dbid);
});

test("db can bootstrap a new schema", async () => {
  const dbid = util.uuidToBytes(crypto.randomUUID());
  const db = new DB(TestConfig, dbid, (name, version) =>
    sdb.getSchema("ns", name, version)
  );

  await db.migrateTo("test.sql", 1n);

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
  const dbid = util.uuidToBytes(crypto.randomUUID());
  const db = new DB(TestConfig, dbid, (name, version) =>
    sdb.getSchema("ns", name, version)
  );

  let result1 = await db.migrateTo("test.sql", 1n);
  let result2 = await db.migrateTo("test.sql", 1n);

  expect(result1).toBe("apply");
  expect(result2).toBe("noop");

  // result1 = await db.migrateTo("test.sql", -4199889328989581946n);
  // result2 = await db.migrateTo("test.sql", -4199889328989581946n);
  // expect(result2).toBe("noop");
});

test("migrating to an unrelated schema is an error", async () => {
  const dbid = util.uuidToBytes(crypto.randomUUID());
  const db = new DB(TestConfig, dbid, (name, version) =>
    sdb.getSchema("ns", name, version)
  );

  await db.migrateTo("test.sql", 1n);

  await expect(() => db.migrateTo("test2.sql", 1n)).toThrow();
});

test("db can migrate to a new schema", async () => {
  const sdb = new ServiceDB(TestConfig, true);
  sdb.addSchema(
    "ns",
    "test.sql",
    1n,
    `CREATE TABLE foo (a primary key, b);
      SELECT crsql_as_crr('foo');`,
    true
  );
  const dbid = util.uuidToBytes(crypto.randomUUID());
  const db = new DB(TestConfig, dbid, (name, version) =>
    sdb.getSchema("ns", name, version)
  );

  const result1 = await db.migrateTo("test.sql", 1n);

  sdb.addSchema(
    "ns",
    "test.sql",
    2n,
    `CREATE TABLE IF NOT EXISTS foo (
      a primary key,
      b,
      c
    );
    
    SELECT crsql_as_crr('foo');`,
    true
  );

  const result2 = await db.migrateTo("test.sql", 2n);

  expect(result1).toBe("apply");
  expect(result2).toBe("migrate");

  // should have 3 cols now
  expect(() =>
    db.__testsOnly().prepare(`INSERT INTO foo (a, b, c) VALUES (1, 2, 3)`).run()
  ).not.toThrow();
});

// test("can not migrate to a non-active version");

test("db can read and write a changeset", async () => {
  const dbid1 = util.uuidToBytes(crypto.randomUUID());
  const db1 = new DB(TestConfig, dbid1, (name, version) =>
    sdb.getSchema("ns", name, version)
  );
  const dbid2 = util.uuidToBytes(crypto.randomUUID());
  const db2 = new DB(TestConfig, dbid2, (name, version) =>
    sdb.getSchema("ns", name, version)
  );

  await db1.migrateTo("test.sql", 1n);
  await db2.migrateTo("test.sql", 1n);
  db1.__testsOnly().exec(`INSERT INTO foo VALUES (1, 2)`);

  const changesFrom1 = [...db1.getChanges(dbid2, 0n)];
  db2.applyChanges(dbid1, changesFrom1);
});
