import { test, expect, afterAll, vi } from "vitest";
import DBCache from "../DBCache";
import TestConfig from "../../config/TestConfig";
import util from "../util";
import ServiceDB from "../ServiceDB";
import { bytesToHex } from "@vlcn.io/direct-connect-common";

test("cache evicts", () => {
  vi.useFakeTimers();
  const sdb = new ServiceDB(TestConfig, true);
  const cache = new DBCache(TestConfig, (name, version) =>
    sdb.getSchema("ns", name, version)
  );

  const uuid = crypto.randomUUID();
  const dbid = util.uuidToBytes(uuid);
  const dbidStr = bytesToHex(dbid);
  const db = cache.get(dbid);
  const internalMap = cache.__testsOnly();

  expect(internalMap.size).toBe(1);
  expect(internalMap.get(dbidStr)?.[1]).toBe(db);
  // advance but not enough to evict
  vi.advanceTimersByTime(TestConfig.cacheTtlInSeconds * 1000 + 10);
  expect(internalMap.size).toBe(1);
  expect(internalMap.get(dbidStr)?.[1]).toBe(db);

  // advance enough to evict
  vi.advanceTimersByTime(TestConfig.cacheTtlInSeconds * 1000 + 10);
  expect(internalMap.size).toBe(0);
});

test("cache bumps to now on usage", () => {
  vi.useFakeTimers();
  const sdb = new ServiceDB(TestConfig, true);
  const cache = new DBCache(TestConfig, (name, version) =>
    sdb.getSchema("ns", name, version)
  );

  const uuid = crypto.randomUUID();
  const dbid = util.uuidToBytes(uuid);
  const dbidStr = bytesToHex(dbid);
  const db = cache.get(dbid);
  const internalMap = cache.__testsOnly();

  expect(internalMap.size).toBe(1);
  expect(internalMap.get(dbidStr)?.[1]).toBe(db);
  vi.advanceTimersByTime(TestConfig.cacheTtlInSeconds * 1000 + 10);
  expect(internalMap.size).toBe(1);
  expect(internalMap.get(dbidStr)?.[1]).toBe(db);
  const cacheddb = cache.get(dbid);
  expect(cacheddb).toBe(db);

  vi.advanceTimersByTime(TestConfig.cacheTtlInSeconds * 1000 + 10);
  expect(internalMap.size).toBe(1);
  expect(internalMap.get(dbidStr)?.[1]).toBe(db);

  vi.advanceTimersByTime(TestConfig.cacheTtlInSeconds * 1000 + 1000);
  expect(internalMap.size).toBe(0);
});
