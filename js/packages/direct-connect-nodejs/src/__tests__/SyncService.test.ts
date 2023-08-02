import { test, expect, vi } from "vitest";
import SyncService from "../SyncService";
import TestConfig from "../config/TestConfig";
import DBCache from "../private/DBCache";
import ServiceDB from "../private/ServiceDB";
import FSNotify from "../private/FSNotify";
import { Change, tags } from "@vlcn.io/direct-connect-common";
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
    version: 1n,
    content: "test",
    activate: true,
  });

  const schemas = removeTime(svc.listSchemas());
  expect(schemas).toEqual([
    {
      name: "test",
      version: 1n,
      active: 1n,
    },
  ]);

  svc.uploadSchema({
    _tag: tags.uploadSchema,
    name: "test",
    version: 2n,
    content: "test",
    activate: true,
  });

  const schemas2 = removeTime(svc.listSchemas());
  expect(schemas2).toEqual([
    {
      name: "test",
      version: 2n,
      active: 1n,
    },
    {
      name: "test",
      version: 1n,
      active: 0n,
    },
  ]);

  svc.uploadSchema({
    _tag: tags.uploadSchema,
    name: "test",
    version: 3n,
    content: "test",
    activate: false,
  });

  const schemas3 = removeTime(svc.listSchemas());
  expect(schemas3).toEqual([
    {
      name: "test",
      version: 3n,
      active: 0n,
    },
    {
      name: "test",
      version: 2n,
      active: 1n,
    },
    {
      name: "test",
      version: 1n,
      active: 0n,
    },
  ]);

  // upload a schema version that already exists fails
  expect(() => {
    svc.uploadSchema({
      _tag: tags.uploadSchema,
      name: "test",
      version: 3n,
      content: "test",
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
    version: 1n,
    content: "test",
    activate: false,
  });

  const schemas = removeTime(svc.listSchemas());
  expect(schemas).toEqual([
    {
      name: "test",
      version: 1n,
      active: 0n,
    },
  ]);

  svc.activateSchemaVersion({
    _tag: tags.activateSchema,
    name: "test",
    version: 1n,
  });

  const schemas2 = removeTime(svc.listSchemas());
  expect(schemas2).toEqual([
    {
      name: "test",
      version: 1n,
      active: 1n,
    },
  ]);

  // try activating something that doesn't exist
  expect(() => {
    svc.activateSchemaVersion({
      _tag: tags.activateSchema,
      name: "test",
      version: 2n,
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
    version: 1n,
    content: "CREATE TABLE IF NOT EXISTS foo (a primary key, b);",
    activate: true,
  });

  const dbid = util.uuidToBytes(crypto.randomUUID());
  const requestorDbid = util.uuidToBytes(crypto.randomUUID());
  let resp = svc.createOrMigrateDatabase({
    _tag: tags.createOrMigrate,
    dbid,
    requestorDbid,
    schemaName: "test",
    schemaVersion: 1n,
  });
  expect(resp).toEqual({
    _tag: tags.createOrMigrateResponse,
    status: "apply",
    seq: [0n, 0],
  });
  resp = svc.createOrMigrateDatabase({
    _tag: tags.createOrMigrate,
    dbid,
    requestorDbid,
    schemaName: "test",
    schemaVersion: 1n,
  });
  expect(resp).toEqual({
    _tag: tags.createOrMigrateResponse,
    status: "noop",
    seq: [0n, 0],
  });

  // bad schema (not exists)
  expect(() => {
    svc.createOrMigrateDatabase({
      _tag: tags.createOrMigrate,
      dbid,
      requestorDbid,
      schemaName: "test",
      schemaVersion: 2n,
    });
  }).toThrow();

  // bad schema (not same as db)
  expect(() => {
    svc.createOrMigrateDatabase({
      _tag: tags.createOrMigrate,
      dbid,
      requestorDbid,
      schemaName: "best",
      schemaVersion: 1n,
    });
  }).toThrow();

  svc.uploadSchema({
    _tag: tags.uploadSchema,
    name: "test",
    version: 2n,
    content: "CREATE TABLE IF NOT EXISTS foo (a primary key, b, c);",
    activate: false,
  });

  // bad schema version (not active)
  expect(() => {
    svc.createOrMigrateDatabase({
      _tag: tags.createOrMigrate,
      dbid,
      requestorDbid,
      schemaName: "test",
      schemaVersion: 2n,
    });
  }).toThrow();

  svc.activateSchemaVersion({
    _tag: tags.activateSchema,
    name: "test",
    version: 2n,
  });
  resp = svc.createOrMigrateDatabase({
    _tag: tags.createOrMigrate,
    dbid,
    requestorDbid,
    schemaName: "test",
    schemaVersion: 2n,
  });
  expect(resp).toEqual({
    _tag: tags.createOrMigrateResponse,
    status: "migrate",
    seq: [0n, 0],
  });
});

test("apply changes", () => {
  const svcDb = new ServiceDB(TestConfig, true);
  const cache = new DBCache(TestConfig, svcDb.defaultSchemaProvider);
  const svc = new SyncService(TestConfig, cache, svcDb);

  svc.uploadSchema({
    _tag: tags.uploadSchema,
    name: "test",
    version: 1n,
    content: `
    CREATE TABLE IF NOT EXISTS foo (a primary key, b);
    SELECT crsql_as_crr('foo');
    `,
    activate: true,
  });

  const dbid = util.uuidToBytes(crypto.randomUUID());
  const requestorDbid = util.uuidToBytes(crypto.randomUUID());
  const fromDbid = util.uuidToBytes(crypto.randomUUID());
  svc.createOrMigrateDatabase({
    _tag: tags.createOrMigrate,
    dbid,
    requestorDbid,
    schemaName: "test",
    schemaVersion: 1n,
  });

  const changes: Change[] = [
    ["foo", new Uint8Array([1, 9, 1]), "b", 2, 1n, 1n, 1n],
  ];

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
    schemaVersion: 1n,
    seqStart: [0n, 0],
    seqEnd: [1n, 0],
    changes,
  });
  expect(resp).toEqual({
    _tag: tags.applyChangesResponse,
  });

  since = svc.getLastSeen({
    _tag: tags.getLastSeen,
    toDbid: dbid,
    fromDbid,
  });

  expect(since).toEqual({
    _tag: tags.getLastSeenResponse,
    seq: [1, 0],
  });

  // write some more changes and ensure we only receive the ones we expect
});

test("get changes", () => {
  const svcDb = new ServiceDB(TestConfig, true);
  const cache = new DBCache(TestConfig, svcDb.defaultSchemaProvider);
  const svc = new SyncService(TestConfig, cache, svcDb);

  svc.uploadSchema({
    _tag: tags.uploadSchema,
    name: "test",
    version: 1n,
    content: `
    CREATE TABLE IF NOT EXISTS foo (a primary key, b);
    SELECT crsql_as_crr('foo');
    `,
    activate: true,
  });

  const dbid = util.uuidToBytes(crypto.randomUUID());
  const requestorDbid = util.uuidToBytes(crypto.randomUUID());
  const fromDbid = util.uuidToBytes(crypto.randomUUID());
  svc.createOrMigrateDatabase({
    _tag: tags.createOrMigrate,
    dbid,
    requestorDbid,
    schemaName: "test",
    schemaVersion: 1n,
  });

  let resp = svc.getChanges({
    _tag: tags.getChanges,
    dbid: dbid,
    requestorDbid: fromDbid,
    since: [0n, 0],
    schemaVersion: 1n,
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

function removeTime(c: any) {
  c.forEach((x: any) => delete x.creation_time);
  return c;
}
