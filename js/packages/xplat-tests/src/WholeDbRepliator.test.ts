import { DBAsync } from "@vlcn.io/xplat-api";
import wdbr, { PokeProtocol } from "@vlcn.io/sync-p2p";
// @ts-ignore
import { v4 as uuidv4, stringify as uuidStringify } from "uuid";
import { Changeset } from "@vlcn.io/sync-p2p";

type DB = DBAsync;

async function createSimpleSchema(db: DB) {
  await db.execMany([
    "CREATE TABLE foo (a primary key, b);",
    "SELECT crsql_as_crr('foo');",
  ]);
  return (await db.execA<[Uint8Array]>("SELECT crsql_site_id()"))[0][0];
}

async function getSite(db: DB) {
  return (await db.execA<[Uint8Array]>("SELECT crsql_site_id()"))[0][0];
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
  "triggers installed": async (
    dbProvider: () => Promise<DB>,
    assert: (p: boolean) => void
  ) => {
    const db = await dbProvider();
    await wdbr.install(await createSimpleSchema(db), db, dummyPoke);

    assert(
      (
        await db.execA<number[]>(
          "SELECT count(*) FROM temp.sqlite_master WHERE type = 'trigger' AND name LIKE 'foo__crsql_wdbreplicator_%'"
        )
      )[0][0] == 3
    );
  },

  "peer tracking table": async (
    dbProvider: () => Promise<DB>,
    assert: (p: boolean) => void
  ) => {
    const db = await dbProvider();
    await wdbr.install(await createSimpleSchema(db), db, dummyPoke);

    assert(
      (
        await db.execA(
          "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = '__crsql_wdbreplicator_peers'"
        )
      )[0][0] == 1
    );
  },

  "changes causes trigger causes poke": async (
    dbProvider: () => Promise<DB>,
    assert: (p: boolean) => void
  ) => {
    const protocol = { ...dummyPoke };
    let sentPoke: boolean = false;
    protocol.poke = (_, __) => {
      sentPoke = true;
    };

    const db = await dbProvider();
    await wdbr.install(await createSimpleSchema(db), db, protocol);

    assert(sentPoke == false);
    await db.exec("INSERT INTO foo VALUES (1,2)");
    await new Promise((resolve) => setTimeout(resolve, 0));
    // @ts-ignore -- typescript being dumb thinks sentPoke cannot be true
    assert(sentPoke == true);

    // insert, update, delete
    sentPoke = false;
    await db.exec("UPDATE foo SET b = 3 WHERE a = 1");
    await new Promise((resolve) => setTimeout(resolve, 0));
    // @ts-ignore -- typescript being dumb thinks sentPoke cannot be true
    assert(sentPoke == true);

    sentPoke = false;
    await db.exec("DELETE FROM foo WHERE a = 1");
    await new Promise((resolve) => setTimeout(resolve, 0));
    // @ts-ignore -- typescript being dumb thinks sentPoke cannot be true
    assert(sentPoke == true);
  },

  "many changes in the same tick only initiate one poke": async (
    dbProvider: () => Promise<DB>,
    assert: (p: boolean) => void
  ) => {
    const protocol = { ...dummyPoke };
    let sentPokeCnt: number = 0;
    protocol.poke = (_, __) => {
      sentPokeCnt += 1;
    };
    const db = await dbProvider();
    const r = await wdbr.install(await createSimpleSchema(db), db, protocol);

    db.exec("INSERT INTO foo VALUES (1,2)");
    db.exec("INSERT INTO foo VALUES (2,2)");
    db.exec("UPDATE foo SET b = 3 WHERE a = 1");
    const last = db.exec("DELETE FROM foo WHERE a = 2");

    if (last && "then" in last) {
      await last;
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert(sentPokeCnt == 1);
    } else {
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert(sentPokeCnt == 1);
    }

    r.dispose();
    db.close();
  },

  "install trigger on added tables on schema change": async (
    dbProvider: () => Promise<DB>,
    assert: (p: boolean) => void
  ) => {
    const db = await dbProvider();
    const r = await wdbr.install(await createSimpleSchema(db), db, dummyPoke);

    await db.exec("CREATE TABLE bar (a primary key, b)");
    await db.exec("SELECT crsql_as_crr('bar');");
    await r.schemaChanged();
    assert(
      (
        await db.execA<number[]>(
          "SELECT count(*) FROM temp.sqlite_master WHERE type = 'trigger' AND name LIKE 'bar__crsql_wdbreplicator_%'"
        )
      )[0][0] == 3
    );

    r.dispose();
    await db.close();
  },

  "triggers are not added for non-crrs": async (
    dbProvider: () => Promise<DB>,
    assert: (p: boolean) => void
  ) => {
    const db = await dbProvider();
    await db.exec("CREATE TABLE bar (a primary key, b)");
    const r = await wdbr.install(await getSite(db), db, dummyPoke);

    assert(
      (
        await db.execA<number[]>(
          "SELECT count(*) FROM temp.sqlite_master WHERE type = 'trigger' AND name LIKE 'bar__crsql_wdbreplicator_%'"
        )
      )[0][0] == 0
    );

    r.dispose();
    await db.close();
  },

  "receiving poke results in request changes": async (
    dbProvider: () => Promise<DB>,
    assert: (p: boolean) => void
  ) => {
    const protocol = { ...dummyPoke };
    let onPoked:
      | ((poker: string, pokerVersion: bigint) => Promise<void>)
      | null = null;
    protocol.onPoked = (cb) => {
      onPoked = cb;
    };
    let changesRequested = false;
    const pokerSiteId = uuidv4();
    protocol.requestChanges = async (siteId, theirVersionForPoker) => {
      assert(theirVersionForPoker == 0n);
      // we request from he who poked us
      assert(siteId == pokerSiteId);
      changesRequested = true;

      // should not be requesting changes from ourself
      assert(siteId != (await db.execA("select crsql_site_id()"))[0][0]);
    };

    const db = await dbProvider();
    await wdbr.install(await createSimpleSchema(db), db, protocol);

    await onPoked!(pokerSiteId, 10n);

    // @ts-ignore
    assert(changesRequested == true);
  },

  "receiving an old poke does not result in request changes": async (
    dbProvider: () => Promise<DB>,
    assert: (p: boolean) => void
  ) => {
    const protocol = { ...dummyPoke };
    let onPoked:
      | ((poker: string, pokerVersion: bigint) => Promise<void>)
      | null = null;
    protocol.onPoked = (cb) => {
      onPoked = cb;
    };
    let changesRequested = false;
    protocol.requestChanges = (siteId, theirVersionForPoker) => {
      changesRequested = true;
    };

    const db = await dbProvider();
    const r = await wdbr.install(await createSimpleSchema(db), db, protocol);

    await onPoked!(uuidv4(), 0n);

    // @ts-ignore
    assert(changesRequested == false);
    r.dispose();
    await db.close();
  },

  "receiving changes applies changes": async (
    dbProvider: () => Promise<DB>,
    assert: (p: boolean) => void
  ) => {
    const protocol = { ...dummyPoke };
    let changesReceived:
      | null
      | ((sender: string, cs: readonly Changeset[]) => Promise<void>) = null;
    const changeSender = uuidv4();
    protocol.onChangesReceived = (cb) => {
      changesReceived = cb;
    };

    const db = await dbProvider();
    const r = await wdbr.install(await createSimpleSchema(db), db, protocol);

    // TODO: check when version exceeds max and gets flipped to a string -- must be stored as int.
    // pk got encoded as decimal? wtf?
    const changeset: readonly Changeset[] = [
      ["foo", new Uint8Array([1, 9, 1]), "b", "foobar", 1, 1, uuidv4(), 1],
    ];

    await changesReceived!(changeSender, changeset);

    const row = (await db.execA<any>("select * from foo"))[0];
    assert(row[0] == 1);
    assert(row[1] == "foobar");

    r.dispose();
    await db.close();
  },

  "pushes changes when changes requested": (
    dbProvider: () => Promise<DB>,
    assert: (p: boolean) => void
  ) => {},

  // network should re-push those on its own to other peers connected but not sending this change
  "sync/applying changes does not trigger a poke": async (
    dbProvider: () => Promise<DB>,
    assert: (p: boolean) => void
  ) => {
    const protocol = { ...dummyPoke };
    const changeSender = uuidv4();
    let changesReceived:
      | null
      | ((siteId: string, cs: readonly Changeset[]) => Promise<void>) = null;
    protocol.onChangesReceived = (cb) => {
      changesReceived = cb;
    };
    let sentPoke: boolean = false;
    protocol.poke = (_, __) => {
      sentPoke = true;
    };

    const db = await dbProvider();
    const r = await wdbr.install(await createSimpleSchema(db), db, protocol);

    // TODO: check when version exceeds max and gets flipped to a string -- must be stored as int.
    // pk got encoded as decimal? wtf?
    const changeset: readonly Changeset[] = [
      ["foo", new Uint8Array([1, 9, 1]), "b", "foobar", 1, 1, uuidv4(), 1],
    ];

    await changesReceived!(changeSender, changeset);

    await new Promise((resolve) => setTimeout(resolve, 0));
    // @ts-ignore -- typescript being dumb thinks sentPoke cannot be true
    assert(sentPoke == false);

    r.dispose();
    db.close();
  },

  "applying changes from a remote updates _our version for that remote_":
    async (dbProvider: () => Promise<DB>, assert: (p: boolean) => void) => {
      const protocol = { ...dummyPoke };
      let changesReceived:
        | null
        | ((sender: string, cs: readonly Changeset[]) => Promise<void>) = null;
      const changeSender = uuidv4();
      protocol.onChangesReceived = (cb) => {
        changesReceived = cb;
      };

      const db = await dbProvider();
      const r = await wdbr.install(await createSimpleSchema(db), db, protocol);

      const changeset: readonly Changeset[] = [
        [
          "foo",
          new Uint8Array([1, 9, 1]),
          "b",
          "foobar",
          1,
          1,
          changeSender,
          1,
        ],
      ];

      await changesReceived!(changeSender, changeset);

      const rows = await db.execA<any>(
        "select site_id, version from __crsql_wdbreplicator_peers"
      );
      const row = rows[0];

      assert(uuidStringify(row[0]) == changeSender);
      assert(row[1] == 1);

      r.dispose();
      db.close();
    },

  "applied changes surface the right site id": async () => {},

  // TODO: test recording of site_id blob in `changes` vtab

  "tear down removes triggers": (
    dbProvider: () => Promise<DB>,
    assert: (p: boolean) => void
  ) => {},

  // test out of bounds cids, bad pks, bad vals, etc.
} as const;
