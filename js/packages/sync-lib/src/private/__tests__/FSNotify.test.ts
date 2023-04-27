/**
 * This tests the FSNotify class to ensure that it is properly converting filesystem events to notifications.
 */

import { test, expect } from "vitest";
import FSNotify from "../FSNotify";
import TestConfig from "../../TestConfig";
import DBCache from "../../DBCache";

test("writes to the database notify fs listeners", () => {
  const fsNotify = new FSNotify(TestConfig, new DBCache(TestConfig));
  const cb = () => {};

  // create a db that we can use to test filesystem events.

  fsNotify.addListener(db.dbid, cb);
  db.applyChangeset({} as any);
  expect(cb).toHaveBeenCalled();
  fsNotify.removeListener(db.dbid, cb);
  db.applyChangeset({} as any);
  expect(cb).toHaveBeenCalledTimes(1);
  fsNotify.shutdown();
});
