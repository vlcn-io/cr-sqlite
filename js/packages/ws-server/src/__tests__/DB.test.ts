import { test, expect } from "vitest";
import DB from "../DB.js";
import fs from "node:fs";
import { Config } from "../config.js";
import { cryb64 } from "@vlcn.io/ws-common";

test("db instantiation", () => {
  const config: Config = {
    schemaFolder: "./testSchemas",
    dbFolder: null,
    pathPattern: /\/vlcn-ws/,
  };

  const schemaContent = fs.readFileSync("./testSchemas/test.sql", "utf-8");
  const schemaVersion = cryb64(schemaContent);
  const db = new DB(config, "some-db", "test.sql", schemaVersion);
  expect(db).toBeDefined();
  db.close();
});

test("pull changes", () => {});

test("write changes", () => {});

test("get last seen", () => {});

// TODO: test schema migration
