import { test, expect } from "vitest";

import { wdbTests } from "@vlcn.io/xplat-tests";
import crsqlite from "@vlcn.io/crsqlite-allinone";

Object.entries(wdbTests).forEach((x) => {
  test(x[0], () => {
    const tc = x[1];
    tc(
      async () => crsqlite.open(),
      (p: boolean) => expect(p).toBe(true)
    );
  });
});

import { tblrxTests } from "@vlcn.io/xplat-tests";

Object.entries(tblrxTests).forEach((x) => {
  test(x[0], () => {
    const tc = x[1];
    tc(
      async () => crsqlite.open(),
      (p: boolean) => expect(p).toBe(true)
    );
  });
});
