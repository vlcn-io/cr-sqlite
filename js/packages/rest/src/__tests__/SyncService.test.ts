import { test, expect } from "vitest";
import SyncService from "../SyncService";
import TestConfig from "../config/TestConfig";
import DBCache from "../private/DBCache";
import ServiceDB from "../private/ServiceDB";
import FSNotify from "../private/FSNotify";

test("constructing", () => {
  const svcDb = new ServiceDB(TestConfig, true);
  const cache = new DBCache(TestConfig, svcDb.defaultSchemaProvider);
  let svc = new SyncService(
    TestConfig,
    new DBCache(TestConfig, svcDb.defaultSchemaProvider),
    svcDb
  );

  svc = new SyncService(
    TestConfig,
    cache,
    svcDb,
    new FSNotify(TestConfig, cache)
  );
});
