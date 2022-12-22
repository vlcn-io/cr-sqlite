import { test, expect, beforeAll, afterAll } from "vitest";
import { resolve } from "import-meta-resolve";
import { configure } from "../config.js";
import config from "../config.js";
import SQLiteDB from "better-sqlite3";
import {
  validate as uuidValidate,
  parse as uuidParse,
  stringify as uuidStringify,
} from "uuid";

import fs from "node:fs";
import { randomUUID } from "node:crypto";
import dbFactory from "../db.js";
import path from "node:path";
const modulePath = await resolve("@vlcn.io/crsqlite", import.meta.url);

configure({
  dbDir: "./dbs/test",
  schemaDir: "./schemas/test",
});

let existingDbId = randomUUID();
// create persistent db(s)
beforeAll(() => {
  fs.mkdirSync(config.get.dbDir);

  const db = new SQLiteDB(path.join(config.get.dbDir, existingDbId));
  db.exec(`CREATE TABLE "__crsql_siteid" (site_id)`);
  const stmt = db.prepare(`INSERT INTO "__crsql_siteid" VALUES (?)`);
  stmt.run(uuidParse(existingDbId));
  db.close();
});

test("opening an existing db", async () => {
  // pass a bogus schema name -- if the db exists we should never try to apply the schema.
  const db = await dbFactory(existingDbId, {
    schemaName: "does-not-exist",
  });

  expect(db.siteId).toBe(existingDbId);
  const siteid = db.__db_for_tests
    .prepare("SELECT crsql_siteid() as sid")
    .get().sid;
  expect(db.siteId).toBe(uuidStringify(siteid));
});

test("dangerous schema names are not allowed", async () => {
  expect(
    async () =>
      await dbFactory(randomUUID(), {
        schemaName: ".",
      })
  ).rejects.toThrow();

  expect(
    async () =>
      await dbFactory(randomUUID(), {
        schemaName: "..",
      })
  ).rejects.toThrow();

  expect(
    async () =>
      await dbFactory(randomUUID(), {
        schemaName: "../",
      })
  ).rejects.toThrow();

  expect(
    async () =>
      await dbFactory(randomUUID(), {
        schemaName: "sdf/s",
      })
  ).rejects.toThrow();

  expect(
    async () =>
      await dbFactory(randomUUID(), {
        schemaName: "~",
      })
  ).rejects.toThrow();

  expect(
    async () =>
      await dbFactory(randomUUID(), {
        schemaName: "/foo",
      })
  ).rejects.toThrow();
});

test("dangerous db names are not allowed", () => {
  expect(
    async () =>
      await dbFactory(".", {
        schemaName: "foo",
      })
  ).rejects.toThrow();

  expect(
    async () =>
      await dbFactory("/sd", {
        schemaName: "foo",
      })
  ).rejects.toThrow();

  expect(
    async () =>
      await dbFactory("..", {
        schemaName: "foo",
      })
  ).rejects.toThrow();

  expect(
    async () =>
      await dbFactory("~", {
        schemaName: "foo",
      })
  ).rejects.toThrow();
});

test("creating a new db", async () => {
  let dbid = randomUUID();
  const db = await dbFactory(dbid, {
    schemaName: "test-one",
  });

  expect(db.siteId).toBe(dbid);
  const siteid = db.__db_for_tests
    .prepare("SELECT crsql_siteid() as sid")
    .get().sid;
  expect(db.siteId).toBe(uuidStringify(siteid));

  // check that we can insert into the table that should exist
  db.__db_for_tests.exec('INSERT INTO "foo" VALUES (1, 2)');
  const changeset = db.pullChangeset(randomUUID(), [0, 0]);
  expect(changeset).toEqual([["foo", "1", "b", "2", "1", "1", dbid]]);
});

afterAll(() => {
  // clean up created dbs
  fs.rmSync(config.get.dbDir, { recursive: true });
});
