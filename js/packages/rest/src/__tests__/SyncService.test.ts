import { test, expect } from "vitest";
import SyncService from "../SyncService";
import TestConfig from "../config/TestConfig";
import DBCache from "../private/DBCache";
import ServiceDB from "../private/ServiceDB";
import FSNotify from "../private/FSNotify";
import { Change, tags } from "../Types";
import util from "../private/util";

test("constructing", () => {
  const svcDb = new ServiceDB(TestConfig, true);
  const cache = new DBCache(TestConfig, svcDb.defaultSchemaProvider);
  let svc = new SyncService(TestConfig, cache, svcDb);

  svc = new SyncService(
    TestConfig,
    cache,
    svcDb,
    new FSNotify(TestConfig, cache)
  );
});

test("uploading and listing schemas", () => {
  const svcDb = new ServiceDB(TestConfig, true);
  const cache = new DBCache(TestConfig, svcDb.defaultSchemaProvider);
  const svc = new SyncService(TestConfig, cache, svcDb);

  svc.uploadSchema({
    _tag: tags.uploadSchema,
    name: "test",
    version: "1",
    contents: "test",
    activate: true,
  });

  const schemas = svc.listSchemas();
  expect(schemas).toEqual([
    {
      name: "test",
      version: "1",
      active: true,
    },
  ]);

  svc.uploadSchema({
    _tag: tags.uploadSchema,
    name: "test",
    version: "2",
    contents: "test",
    activate: true,
  });

  const schemas2 = svc.listSchemas();
  expect(schemas2).toEqual([
    {
      name: "test",
      version: "2",
      active: true,
    },
    {
      name: "test",
      version: "1",
      active: false,
    },
  ]);

  svc.uploadSchema({
    _tag: tags.uploadSchema,
    name: "test",
    version: "3",
    contents: "test",
    activate: false,
  });

  const schemas3 = svc.listSchemas();
  expect(schemas3).toEqual([
    {
      name: "test",
      version: "3",
      active: false,
    },
    {
      name: "test",
      version: "2",
      active: true,
    },
    {
      name: "test",
      version: "1",
      active: false,
    },
  ]);

  // upload a schema version that alreaddy exists fails
  expect(() => {
    svc.uploadSchema({
      _tag: tags.uploadSchema,
      name: "test",
      version: "3",
      contents: "test",
      activate: false,
    });
  }).toThrow();
});

test("activating a schema", () => {
  const svcDb = new ServiceDB(TestConfig, true);
  const cache = new DBCache(TestConfig, svcDb.defaultSchemaProvider);
  const svc = new SyncService(TestConfig, cache, svcDb);

  svc.uploadSchema({
    _tag: tags.uploadSchema,
    name: "test",
    version: "1",
    contents: "test",
    activate: false,
  });

  const schemas = svc.listSchemas();
  expect(schemas).toEqual([
    {
      name: "test",
      version: "1",
      active: false,
    },
  ]);

  svc.activateSchemaVersion({
    _tag: tags.activateSchema,
    name: "test",
    version: "1",
  });

  const schemas2 = svc.listSchemas();
  expect(schemas2).toEqual([
    {
      name: "test",
      version: "1",
      active: true,
    },
  ]);

  // try activating something that doesn't exist
  expect(() => {
    svc.activateSchemaVersion({
      _tag: tags.activateSchema,
      name: "test",
      version: "2",
    });
  }).toThrow();
});

test("creating a database", () => {
  const svcDb = new ServiceDB(TestConfig, true);
  const cache = new DBCache(TestConfig, svcDb.defaultSchemaProvider);
  const svc = new SyncService(TestConfig, cache, svcDb);

  svc.uploadSchema({
    _tag: tags.uploadSchema,
    name: "test",
    version: "1",
    contents: "CREATE TABLE IF NOT EXISTS foo (a primary key, b);",
    activate: true,
  });

  const dbid = util.uuidToBytes(crypto.randomUUID());
  let resp = svc.createOrMigrateDatabase({
    _tag: tags.createOrMigrate,
    dbid,
    schemaName: "test",
    schemaVersion: "1",
  });
  expect(resp).toEqual({
    _tag: tags.createOrMigrateResponse,
    status: "apply",
  });
  resp = svc.createOrMigrateDatabase({
    _tag: tags.createOrMigrate,
    dbid,
    schemaName: "test",
    schemaVersion: "1",
  });
  expect(resp).toEqual({
    _tag: tags.createOrMigrateResponse,
    status: "noop",
  });

  // bad schema (not exists)
  expect(() => {
    svc.createOrMigrateDatabase({
      _tag: tags.createOrMigrate,
      dbid,
      schemaName: "test",
      schemaVersion: "2",
    });
  }).toThrow();

  // bad schema (not same as db)
  expect(() => {
    svc.createOrMigrateDatabase({
      _tag: tags.createOrMigrate,
      dbid,
      schemaName: "best",
      schemaVersion: "1",
    });
  }).toThrow();

  svc.uploadSchema({
    _tag: tags.uploadSchema,
    name: "test",
    version: "2",
    contents: "CREATE TABLE IF NOT EXISTS foo (a primary key, b, c);",
    activate: false,
  });

  // bad schema version (not active)
  expect(() => {
    svc.createOrMigrateDatabase({
      _tag: tags.createOrMigrate,
      dbid,
      schemaName: "test",
      schemaVersion: "2",
    });
  }).toThrow();

  svc.activateSchemaVersion({
    _tag: tags.activateSchema,
    name: "test",
    version: "2",
  });
  resp = svc.createOrMigrateDatabase({
    _tag: tags.createOrMigrate,
    dbid,
    schemaName: "test",
    schemaVersion: "2",
  });
  expect(resp).toEqual({
    _tag: tags.createOrMigrateResponse,
    status: "migrate",
  });
});

test("apply changes", () => {
  const svcDb = new ServiceDB(TestConfig, true);
  const cache = new DBCache(TestConfig, svcDb.defaultSchemaProvider);
  const svc = new SyncService(TestConfig, cache, svcDb);

  svc.uploadSchema({
    _tag: tags.uploadSchema,
    name: "test",
    version: "1",
    contents: `
    CREATE TABLE IF NOT EXISTS foo (a primary key, b);
    SELECT crsql_as_crr('foo');
    `,
    activate: true,
  });

  const dbid = util.uuidToBytes(crypto.randomUUID());
  const fromDbid = util.uuidToBytes(crypto.randomUUID());
  svc.createOrMigrateDatabase({
    _tag: tags.createOrMigrate,
    dbid,
    schemaName: "test",
    schemaVersion: "1",
  });

  const changes: Change[] = [["foo", "1", "b", "2", 1n, 1n]];

  let since = svc.getLastSeen({
    _tag: tags.getLastSeen,
    toDbid: dbid,
    fromDbid,
  });

  expect(since).toEqual({
    _tag: tags.getLastSeenResponse,
    seq: [0n, 0],
  });

  const resp = svc.applyChanges({
    _tag: tags.applyChanges,
    toDbid: dbid,
    fromDbid,
    schemaVersion: "1",
    seqStart: [0n, 0],
    seqEnd: [1n, 0],
    changes,
  });
  expect(resp).toEqual({
    _tag: tags.applyChangesResponse,
    status: "ok",
  });

  since = svc.getLastSeen({
    _tag: tags.getLastSeen,
    toDbid: dbid,
    fromDbid,
  });

  expect(since).toEqual({
    _tag: tags.getLastSeenResponse,
    seq: [1n, 0],
  });
});

test("get changes", () => {
  const svcDb = new ServiceDB(TestConfig, true);
  const cache = new DBCache(TestConfig, svcDb.defaultSchemaProvider);
  const svc = new SyncService(TestConfig, cache, svcDb);

  svc.uploadSchema({
    _tag: tags.uploadSchema,
    name: "test",
    version: "1",
    contents: `
    CREATE TABLE IF NOT EXISTS foo (a primary key, b);
    SELECT crsql_as_crr('foo');
    `,
    activate: true,
  });

  const dbid = util.uuidToBytes(crypto.randomUUID());
  const fromDbid = util.uuidToBytes(crypto.randomUUID());
  svc.createOrMigrateDatabase({
    _tag: tags.createOrMigrate,
    dbid,
    schemaName: "test",
    schemaVersion: "1",
  });

  let resp = svc.getChanges({
    _tag: tags.getChanges,
    dbid: dbid,
    requestorDbid: fromDbid,
    since: [0n, 0],
    schemaVersion: "1",
  });

  expect(resp).toEqual({
    _tag: tags.getChangesResponse,
    seqStart: [0n, 0],
    seqEnd: [0n, 0],
    changes: [],
  });

  // do some inserts then get changes.
});

test("start outbound stream", () => {});

// last seen test?
