import { tblrxTests } from "@vlcn.io/xplat-tests";
import sqliteWasm from "@vlcn.io/wa-crsqlite";

// @ts-ignore
import wasmUrl from "@vlcn.io/wa-crsqlite/wa-sqlite-async.wasm?url";

const crsqlite = await sqliteWasm(() => wasmUrl);

describe("WholeDbReplicator.cy.ts", () => {
  Object.entries(tblrxTests).forEach((x) => {
    it(x[0], () => {
      const tc = x[1];
      tc(
        () => crsqlite.open(),
        (p: boolean) => expect(p).to.equal(true)
      );
    });
  });
});
