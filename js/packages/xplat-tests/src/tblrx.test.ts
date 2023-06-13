import { DBAsync, UpdateType, UPDATE_TYPE } from "@vlcn.io/xplat-api";
type DB = DBAsync;
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
    let notified: UpdateType[] = [];
    rx.onRange(["foo"], (updateTypes: UpdateType[]) => {
      notified = updateTypes;
    });

    await db.exec("INSERT INTO foo VALUES (1, 2)");
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert(notified.length == 1);
    assert(notified.includes(UPDATE_TYPE.INSERT));

    await db.close();
  },

  // TODO: we need to make this true!
  // "only is notified on tx complete": async (
  //   dbProvider: () => Promise<DB>,
  //   assert: (p: boolean) => void
  // ) => {
  //   const db = await dbProvider();
  //   await createSimpleSchema(db);
  //   const rx = tblrx(db);
  //   let notified: UpdateType[] = [];
  //   rx.onRange(["foo"], (tbls) => {
  //     notified = tbls;
  //   });

  //   await db.tx(async (tx) => {
  //     await tx.exec("INSERT INTO foo VALUES (1, 2)");
  //     await new Promise((resolve) => setTimeout(resolve, 0));
  //     assert(notified.length == 0);
  //   });

  //   await new Promise((resolve) => setTimeout(resolve, 0));
  //   assert(notified.length == 1);
  //   assert(notified.includes(UPDATE_TYPE.INSERT));

  //   await db.close();
  // },

  // TODO: untestable in async db mode
  "collects all notifications till the next micro task": async (
    dbProvider: () => Promise<DB>,
    assert: (p: boolean) => void
  ) => {
    const db = await dbProvider();
    await createSimpleSchema(db);
    const rx = await tblrx(db);

    let notified = false;
    rx.onRange(["foo"], () => {
      notified = true;
    });

    db.exec("INSERT INTO foo VALUES (1,2)");
    db.exec("INSERT INTO foo VALUES (2,3)");
    const last = db.exec("DELETE FROM foo WHERE a = 1");

    assert(notified == false);

    if (last && "then" in last) {
      await last;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));

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
    rx.onRange([], () => {
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
    let notifiedBar = false;
    let notifiedBaz = false;
    rx.onRange(["bar"], () => {
      notifiedBar = true;
    });
    rx.onRange(["baz"], () => {
      notifiedBaz = true;
    });

    await db.exec("CREATE TABLE bar (a, b)");
    await db.exec("INSERT INTO bar VALUES (1,2)");

    await new Promise((resolve) => setTimeout(resolve, 0));

    assert(notifiedBar);
    assert(notifiedBaz == false);
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
    const disposer = rx.onRange(["foo"], () => {
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
