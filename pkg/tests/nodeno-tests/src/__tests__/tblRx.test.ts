import { test, expect } from "vitest";
import { tblrxTests } from "@vlcn.io/xplat-tests";
import crsqlite from "@vlcn.io/crsqlite-allinone";

Object.entries(tblrxTests).forEach((x) => {
  test(x[0], () => {
    const tc = x[1];
    tc(
      () => crsqlite.open(),
      (p: boolean) => expect(p).toBe(true)
    );
  });
});
