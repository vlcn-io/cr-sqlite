import "../fill.js";

import { test, expect } from "vitest";
import { DBAsync, DB as DBSync } from "@vlcn.io/xplat-api";
type DB = DBAsync | DBSync;
import crsqlite from "@vlcn.io/crsqlite-allinone";

function runTests(tests: {
  [key: string]: (
    dbProvider: () => Promise<DB>,
    assert: (p: boolean) => void
  ) => any;
}) {
  Object.entries(tests).forEach((x) => {
    test(x[0], () => {
      const tc = x[1];
      tc(
        async () => crsqlite.open(),
        (p: boolean) => expect(p).toBe(true)
      );
    });
  });
}

// import { wdbTests } from "@vlcn.io/xplat-tests";
// runTests(wdbTests);

// TODO: better-sqlite3 currently does not expose an udpate hook
// import { tblrxTests } from "@vlcn.io/xplat-tests";
// runTests(tblrxTests);

import { intTests } from "@vlcn.io/xplat-tests";
runTests(intTests);
