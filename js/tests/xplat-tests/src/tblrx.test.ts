import { DBAsync, DB as DBSync } from "@vlcn.io/xplat-api";
type DB = DBAsync | DBSync;
import tblrx from "@vlcn.io/rx-tbl";

function createSimpleSchema(db: DB) {
  return db.execMany([
    "CREATE TABLE foo (a primary key, b);",
    "SELECT crsql_as_crr('foo');",
  ]);
}

export const tests = {
  "watches all non clock tables": async (
    dbProvider: () => Promise<DB>,
    assert: (p: boolean) => void
  ) => {
    const db = await dbProvider();
    await createSimpleSchema(db);
    const rx = tblrx(db);
    let notified = new Set<string>();
    rx.on((tbls) => {
      notified = tbls;
    });

    await db.exec("INSERT INTO foo VALUES (1, 2)");
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert(notified.size == 1);
    assert(notified.has("foo"));

    await db.close();
  },

  "only is notified on tx complete": async (
    dbProvider: () => Promise<DB>,
    assert: (p: boolean) => void
  ) => {
    const db = await dbProvider();
    await createSimpleSchema(db);
    const rx = tblrx(db);
    let notified = new Set<string>();
    rx.on((tbls) => {
      notified = tbls;
    });

    await db.transaction(async () => {
      await db.exec("INSERT INTO foo VALUES (1, 2)");
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert(notified.size == 0);
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    assert(notified.size == 1);
    assert(notified.has("foo"));

    await db.close();
  },

  // TODO: untestable in async db mode
  "collects all notifications till the next micro task": async (
    dbProvider: () => Promise<DB>,
    assert: (p: boolean) => void
  ) => {
    const db = await dbProvider();
    await createSimpleSchema(db);
    const rx = await tblrx(db);

    let notified = false;
    rx.on(() => {
      notified = true;
    });

    db.exec("INSERT INTO foo VALUES (1,2)");
    db.exec("INSERT INTO foo VALUES (2,3)");
    const last = db.exec("DELETE FROM foo WHERE a = 1");

    assert(notified == false);

    if (last && "then" in last) {
      await last;
    } else {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    // @ts-ignore
    assert(notified == true);
  },

  "de-dupes tables": async (
    dbProvider: () => Promise<DB>,
    assert: (p: boolean) => void
  ) => {
    const db = await dbProvider();
    await createSimpleSchema(db);
    const rx = await tblrx(db);

    let notified = false;
    // tbls must always be a set
    rx.on((tbls: Set<string>) => {
      notified = true;
    });
  },

  "support schema changes post installation of rx": async (
    dbProvider: () => Promise<DB>,
    assert: (p: boolean) => void
  ) => {
    const db = await dbProvider();
    await createSimpleSchema(db);
    const rx = await tblrx(db);
    let notified = new Set<string>();
    rx.on((tbls) => {
      notified = tbls;
    });

    await db.exec("CREATE TABLE bar (a, b)");
    await db.exec("INSERT INTO bar VALUES (1,2)");

    await new Promise((resolve) => setTimeout(resolve, 0));

    assert(notified.size == 1);
    assert(notified.has("bar"));
  },

  "does not fatal for connections that have not loaded the rx extension": (
    dbProvider: () => Promise<DB>,
    assert: (p: boolean) => void
  ) => {},

  "can exclude tables from rx": (
    dbProvider: () => Promise<DB>,
    assert: (p: boolean) => void
  ) => {},

  "disposes of listeners when asked": async (
    dbProvider: () => Promise<DB>,
    assert: (p: boolean) => void
  ) => {
    const db = await dbProvider();
    await createSimpleSchema(db);
    const rx = tblrx(db);

    let notified = false;
    const disposer = rx.on(() => {
      notified = true;
    });

    disposer();

    await db.exec("INSERT INTO foo VALUES (1,2)");
    await db.exec("INSERT INTO foo VALUES (2,3)");
    const last = db.exec("DELETE FROM foo WHERE a = 1");

    if (last && "then" in last) {
      await last;
      await new Promise((resolve) => setTimeout(resolve, 0));
    } else {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    assert(notified == false);
  },
} as const;
