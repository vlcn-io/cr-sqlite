import { test } from "vitest";

import { wdbTests } from "@vlcn.io/replicator-xplat-tests";
import crsqlite from "@vlcn.io/crsqlite-allinone";

Object.entries(wdbTests).forEach((x) => {
  test(x[0], () => {
    const tc = x[1];
    tc(
      () => crsqlite.open(),
      (p: boolean) => expect(p).toBe(true)
    );
  });
});
