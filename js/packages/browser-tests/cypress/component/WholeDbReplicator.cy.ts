import { wdbTests } from "@vlcn.io/xplat-tests";
import sqliteWasm from "@vlcn.io/crsqlite-wasm";

// @ts-ignore
import wasmUrl from "@vlcn.io/crsqlite-wasm/crsqlite.wasm?url";

const crsqlite = await sqliteWasm((file) => wasmUrl);

describe("WholeDbReplicator.cy.ts", () => {
  Object.entries(wdbTests).forEach((x) => {
    it(x[0], () => {
      const tc = x[1];
      return tc(
        () => crsqlite.open(),
        (p: boolean) => expect(p).to.equal(true)
      );
    });
  });
});
