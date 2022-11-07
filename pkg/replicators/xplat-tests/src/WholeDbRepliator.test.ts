import { DB } from "@vlcn.io/xplat-api";
import wdbr, { PokeProtocol } from "@vlcn.io/replicator-wholedb";
// @ts-ignore
import { v4 as uuidv4, stringify as uuidStringify } from "uuid";
import { Changeset } from "@vlcn.io/replicator-wholedb";

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

    assert(
      db.execA<number[]>(
        "SELECT count(*) FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'foo__crsql_wdbreplicator_%'"
      )[0][0] == 3
    );
  },

  "peer tracking table": (
    dbProvider: () => DB,
    assert: (p: boolean) => void
  ) => {
    const db = dbProvider();
    wdbr.install(db, dummyPoke);

    assert(
      db.execA(
        "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = '__crsql_wdbreplicator_peers'"
      )[0][0] == 1
    );
  },

  "changes causes trigger causes poke": async (
    dbProvider: () => DB,
    assert: (p: boolean) => void
  ) => {
    const protocol = { ...dummyPoke };
    let sentPoke: boolean = false;
    protocol.poke = (_, __) => {
      sentPoke = true;
    };

    const db = dbProvider();
    createSimpleSchema(db);
    wdbr.install(db, protocol);

    assert(sentPoke == false);
    db.exec("INSERT INTO foo VALUES (1,2)");
    await new Promise((resolve) => setTimeout(resolve, 0));
    // @ts-ignore -- typescript being dumb thinks sentPoke cannot be true
    assert(sentPoke == true);

    // insert, update, delete
    sentPoke = false;
    db.exec("UPDATE foo SET b = 3 WHERE a = 1");
    await new Promise((resolve) => setTimeout(resolve, 0));
    // @ts-ignore -- typescript being dumb thinks sentPoke cannot be true
    assert(sentPoke == true);

    sentPoke = false;
    db.exec("DELETE FROM foo WHERE a = 1");
    await new Promise((resolve) => setTimeout(resolve, 0));
    // @ts-ignore -- typescript being dumb thinks sentPoke cannot be true
    assert(sentPoke == true);
  },

  "many changes in the same tick only initiate one poke": async (
    dbProvider: () => DB,
    assert: (p: boolean) => void
  ) => {
    const protocol = { ...dummyPoke };
    let sentPokeCnt: number = 0;
    protocol.poke = (_, __) => {
      sentPokeCnt += 1;
    };
    const db = dbProvider();
    createSimpleSchema(db);
    const r = wdbr.install(db, protocol);

    db.exec("INSERT INTO foo VALUES (1,2)");
    db.exec("INSERT INTO foo VALUES (2,2)");
    db.exec("UPDATE foo SET b = 3 WHERE a = 1");
    db.exec("DELETE FROM foo WHERE a = 2");

    await new Promise((resolve) => setTimeout(resolve, 0));
    assert(sentPokeCnt == 1);

    r.dispose();
    db.close();
  },

  "install trigger on added tables on schema change": (
    dbProvider: () => DB,
    assert: (p: boolean) => void
  ) => {
    const db = dbProvider();
    createSimpleSchema(db);
    const r = wdbr.install(db, dummyPoke);

    db.exec("CREATE TABLE bar (a primary key, b)");
    db.exec("SELECT crsql_as_crr('bar');");
    r.schemaChanged();
    assert(
      db.execA<number[]>(
        "SELECT count(*) FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'bar__crsql_wdbreplicator_%'"
      )[0][0] == 3
    );

    r.dispose();
    db.close();
  },

  "triggers are not added for non-crrs": (
    dbProvider: () => DB,
    assert: (p: boolean) => void
  ) => {
    const db = dbProvider();
    db.exec("CREATE TABLE bar (a primary key, b)");
    const r = wdbr.install(db, dummyPoke);

    assert(
      db.execA<number[]>(
        "SELECT count(*) FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'bar__crsql_wdbreplicator_%'"
      )[0][0] == 0
    );

    r.dispose();
    db.close();
  },

  "receiving poke results in request changes": (
    dbProvider: () => DB,
    assert: (p: boolean) => void
  ) => {
    const protocol = { ...dummyPoke };
    let onPoked: ((poker: string, pokerVersion: bigint) => void) | null = null;
    protocol.onPoked = (cb) => {
      onPoked = cb;
    };
    let changesRequested = false;
    protocol.requestChanges = (siteId, theirVersionForPoker) => {
      assert(theirVersionForPoker == 0n);
      assert(siteId == uuidStringify(db.execA("select crsql_siteid()")[0][0]));
      changesRequested = true;
    };

    const db = dbProvider();
    createSimpleSchema(db);
    const r = wdbr.install(db, protocol);

    onPoked!(uuidv4(), 10n);

    // @ts-ignore
    assert(changesRequested == true);
  },

  "receiving an old poke does not result in request changes": (
    dbProvider: () => DB,
    assert: (p: boolean) => void
  ) => {
    const protocol = { ...dummyPoke };
    let onPoked: ((poker: string, pokerVersion: bigint) => void) | null = null;
    protocol.onPoked = (cb) => {
      onPoked = cb;
    };
    let changesRequested = false;
    protocol.requestChanges = (siteId, theirVersionForPoker) => {
      changesRequested = true;
    };

    const db = dbProvider();
    createSimpleSchema(db);
    const r = wdbr.install(db, protocol);

    onPoked!(uuidv4(), 0n);

    // @ts-ignore
    assert(changesRequested == false);
  },

  "receiving changes applies changes": (
    dbProvider: () => DB,
    assert: (p: boolean) => void
  ) => {},

  "pushes changes when changes requested": (
    dbProvider: () => DB,
    assert: (p: boolean) => void
  ) => {},

  // network should re-push those on its own to other peers connected but not sending this change
  "sync/applying changes does not trigger a poke": (
    dbProvider: () => DB,
    assert: (p: boolean) => void
  ) => {
    const protocol = { ...dummyPoke };
    let changesReceived: null | ((cs: readonly Changeset[]) => void) = null;
    protocol.onChangesReceived = (cb) => {
      changesReceived = cb;
    };
    let poked: ((poker: string, pokerVersion: bigint) => void) | null = null;
    protocol.onPoked = (cb) => {
      poked = cb;
    };

    const db = dbProvider();
    createSimpleSchema(db);
    const r = wdbr.install(db, protocol);

    // TODO: check when version exceeds max and gets flipped to a string -- must be stored as int.
    const changeset: readonly Changeset[] = [
      ["foo", 1, 2, "'foobar'", 1, uuidv4()],
    ];

    changesReceived!(changeset);
  },

  "applying changes from a remote updates _our version for that remote_":
    () => {},

  "tear down removes triggers": (
    dbProvider: () => DB,
    assert: (p: boolean) => void
  ) => {},
};
