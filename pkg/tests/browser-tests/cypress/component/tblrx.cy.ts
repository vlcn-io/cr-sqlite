import { tblrxTests } from "@vlcn.io/xplat-tests";
import sqliteWasm from "@vlcn.io/crsqlite-wasm";

const crsqlite = await sqliteWasm();

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
