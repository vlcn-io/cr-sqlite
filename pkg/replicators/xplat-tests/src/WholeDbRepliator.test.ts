import { DB } from "@vlcn.io/xplat-api";
import wdbr, { PokeProtocol } from "@vlcn.io/replicator-wholedb";

function createSimpleSchema(db: DB) {
  db.execMany([
    "CREATE TABLE foo (a primary key, b)",
    "SELECT crsql_as_crr('foo')",
  ]);
}

const dummyPoke: PokeProtocol = {
  dispose() {},
  onChangesReceived(cb) {},
  onChangesRequested(cb) {},
  onNewConnection(cb) {},
  onPoked(cb) {},
  poke(poker, pokerVersion) {},
  pushChanges(to, changesets) {},
  requestChanges(from, since) {},
};

/**
 * Write the test code once, run it on all platforms that support crsqlite.
 *
 * Browser tests use a WASM build.
 * Node/Deno tests use a nativ build.
 *
 * Hence dbProvider to provide the db in the current environment.
 *
 * Browser tests use cypress which uses Chai assertions.
 * Node/Deno use Jest assetions.
 *
 * Hence the assertion provider.
 */
export const tests = {
  "triggers installed": (
    dbProvider: () => DB,
    assert: (p: boolean) => void
  ) => {
    const db = dbProvider();
    createSimpleSchema(db);
    wdbr.install(db, dummyPoke);

    console.log(db.execA("SELECT * FROM sqlite_master WHERE type = 'trigger'"));
  },
  "peer tracking table": (
    dbProvider: () => DB,
    assert: (p: boolean) => void
  ) => {
    const db = dbProvider();
    wdbr.install(db, dummyPoke);

    console.log(db.execA("SELECT * FROM sqlite_master WHERE type = 'table'"));
  },
  "changes causes trigger causes poke": (
    dbProvider: () => DB,
    assert: (p: boolean) => void
  ) => {},
  "re-install trigger on schema change": (
    dbProvider: () => DB,
    assert: (p: boolean) => void
  ) => {},
  "receiving poke results in request changes": (
    dbProvider: () => DB,
    assert: (p: boolean) => void
  ) => {},
  "tread down removes triggers": (
    dbProvider: () => DB,
    assert: (p: boolean) => void
  ) => {},
  "receiving changes applies changes": (
    dbProvider: () => DB,
    assert: (p: boolean) => void
  ) => {},
  "pushes changes when changes requested": (
    dbProvider: () => DB,
    assert: (p: boolean) => void
  ) => {},
};
