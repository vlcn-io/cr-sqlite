import { tblrxTests } from "@vlcn.io/xplat-tests";
import sqliteWasm from "@vlcn.io/crsqlite-wasm";

// @ts-ignore
import wasmUrl from "@vlcn.io/crsqlite-wasm/dist/sqlite3.wasm?url";
// @ts-ignore
import proxyUrl from "@vlcn.io/crsqlite-wasm/dist/sqlite3-opfs-async-proxy.js?url";

const crsqlite = await sqliteWasm({
  locateWasm: () => wasmUrl,
  locateProxy: () => proxyUrl,
});

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
