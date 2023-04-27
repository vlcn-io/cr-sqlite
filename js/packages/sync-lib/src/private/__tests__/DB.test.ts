import { test, expect, afterAll } from "vitest";
import DB from "../DB";
import TestConfig from "../../TestConfig";
import fs from "fs";

test("db loads", () => {
  const dbid = crypto.randomUUID();
  const db = new DB(TestConfig, dbid);

  expect(db).toBeDefined();
});

test("db can read and write a changeset", () => {
  const dbid1 = crypto.randomUUID();
  const db1 = new DB(TestConfig, dbid1);
  const dbid2 = crypto.randomUUID();
  const db2 = new DB(TestConfig, dbid2);
});

afterAll(() => {
  // remove all files from dbs directory
  const dir = TestConfig.dbsDir;
  fs.readdirSync(dir).forEach((file) => {
    fs.unlinkSync(dir + "/" + file);
  });
});
