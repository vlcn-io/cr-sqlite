import { test, expect } from "vitest";
import DB from "../DB.js";
import fs from "node:fs";
import { config } from "../config.js";
import { cryb64 } from "@vlcn.io/partykit-common";

test("db instantiation", () => {
  config.schemaFolder = "./testSchemas";
  const schemaContent = fs.readFileSync("./testSchemas/test.sql", "utf-8");
  const schemaVersion = cryb64(schemaContent);
  const db = new DB(":memory:", "test.sql", schemaVersion);
  expect(db).toBeDefined();
  db.close();
});

test("pull changes", () => {});

test("write changes", () => {});

test("get last seen", () => {});

// TODO: test schema migration
