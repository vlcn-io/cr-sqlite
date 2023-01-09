import { test, expect, beforeAll, afterAll } from "vitest";
import { resolve } from "import-meta-resolve";
import SQLiteDB from "better-sqlite3";
import {
  validate as uuidValidate,
  parse as uuidParse,
  stringify as uuidStringify,
} from "uuid";

import fs from "node:fs";
import dbFactory from "../db.js";
import path from "node:path";
import { randomUuidBytes } from "@vlcn.io/client-server-common";

import * as crypto from "node:crypto";

if (typeof global.crypto === "undefined") {
  (global as any).crypto = crypto;
}

const config = {
  dbDir: "./dbs",
  schemaDir: "./schemas",
  maxOutstandingAcks: 10,
};

let existingDbId = randomUuidBytes();
let existingDbIdStr = uuidStringify(existingDbId);

// create persistent db(s)
beforeAll(() => {
  fs.mkdirSync(config.dbDir);

  const db = new SQLiteDB(path.join(config.dbDir, existingDbIdStr));
  db.exec(`CREATE TABLE "__crsql_siteid" (site_id)`);
  const stmt = db.prepare(`INSERT INTO "__crsql_siteid" VALUES (?)`);
  stmt.run(existingDbId);
  db.close();
});

test("opening an existing db", async () => {
  // pass a bogus schema name -- if the db exists we should never try to apply the schema.
  const db = await dbFactory(config, existingDbId, {
    schemaName: "does-not-exist",
  });

  expect(db.siteId).toBe(existingDbId);
  const siteid = db.__db_for_tests
    .prepare("SELECT crsql_siteid() as sid")
    .get().sid;
  expect(db.siteId).toEqual(new Uint8Array(siteid));
});

test("dangerous schema names are not allowed", async () => {
  expect(
    async () =>
      await dbFactory(config, randomUuidBytes(), {
        schemaName: ".",
      })
  ).rejects.toThrow();

  expect(
    async () =>
      await dbFactory(config, randomUuidBytes(), {
        schemaName: "..",
      })
  ).rejects.toThrow();

  expect(
    async () =>
      await dbFactory(config, randomUuidBytes(), {
        schemaName: "../",
      })
  ).rejects.toThrow();

  expect(
    async () =>
      await dbFactory(config, randomUuidBytes(), {
        schemaName: "sdf/s",
      })
  ).rejects.toThrow();

  expect(
    async () =>
      await dbFactory(config, randomUuidBytes(), {
        schemaName: "~",
      })
  ).rejects.toThrow();

  expect(
    async () =>
      await dbFactory(config, randomUuidBytes(), {
        schemaName: "/foo",
      })
  ).rejects.toThrow();
});

test("dangerous db names are not allowed", () => {
  const encoder = new TextEncoder();
  expect(
    async () =>
      await dbFactory(config, encoder.encode("."), {
        schemaName: "foo",
      })
  ).rejects.toThrow();

  expect(
    async () =>
      await dbFactory(config, encoder.encode("/sd"), {
        schemaName: "foo",
      })
  ).rejects.toThrow();

  expect(
    async () =>
      await dbFactory(config, encoder.encode(".."), {
        schemaName: "foo",
      })
  ).rejects.toThrow();

  expect(
    async () =>
      await dbFactory(config, encoder.encode("~"), {
        schemaName: "foo",
      })
  ).rejects.toThrow();
});

test("creating a new db", async () => {
  let dbid = randomUuidBytes();
  const db = await dbFactory(config, dbid, {
    schemaName: "test-one",
  });

  expect(db.siteId).toEqual(dbid);
  const siteid = db.__db_for_tests
    .prepare("SELECT crsql_siteid() as sid")
    .get().sid;
  expect(db.siteId).toEqual(new Uint8Array(siteid));

  // check that we can insert into the table that should exist
  db.__db_for_tests.exec('INSERT INTO "foo" VALUES (1, 2)');
  const changeset = db.pullChangeset(randomUuidBytes(), [0n, 0]);
  expect(changeset).toEqual([["foo", "1", "b", "2", 1n, 1n]]);
});

afterAll(() => {
  // clean up created dbs
  fs.rmSync(config.dbDir, { recursive: true });
});
