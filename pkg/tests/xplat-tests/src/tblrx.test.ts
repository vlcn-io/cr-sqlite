import { DB } from "@vlcn.io/xplat-api";
import tblrx from "@vlcn.io/rx-tbl";

function createSimpleSchema(db: DB) {
  db.execMany([
    "CREATE TABLE foo (a primary key, b);",
    "SELECT crsql_as_crr('foo');",
  ]);
}

export const tests = {
  "watches all non clock tables": async (
    dbProvider: () => DB,
    assert: (p: boolean) => void
  ) => {
    const db = dbProvider();
    createSimpleSchema(db);
    const rx = await tblrx(db);

    assert(
      db.execA<number[]>(
        "SELECT count(*) FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'foo__crsql_tblrx_%'"
      )[0][0] == 3
    );

    assert(rx.watching.length == 1);
    assert(rx.watching[0] == "foo");
  },

  // "collects all notifications till the next micro task": async (
  //   dbProvider: () => DB,
  //   assert: (p: boolean) => void
  // ) => {
  //   const db = dbProvider();
  //   createSimpleSchema(db);
  //   const rx = await tblrx(db);

  //   let notified = false;
  //   rx.on(() => {
  //     notified = true;
  //   });

  //   db.exec("INSERT INTO foo VALUES (1,2)");
  //   db.exec("INSERT INTO foo VALUES (2,3)");
  //   db.exec("DELETE FROM foo WHERE a = 1");

  //   assert(notified == false);

  //   await new Promise((resolve) => setTimeout(resolve, 0));

  //   // @ts-ignore
  //   assert(notified == true);
  // },

  // "de-dupes tables": async (
  //   dbProvider: () => DB,
  //   assert: (p: boolean) => void
  // ) => {
  //   const db = dbProvider();
  //   createSimpleSchema(db);
  //   const rx = await tblrx(db);

  //   let notified = false;
  //   // tbls must always be a set
  //   rx.on((tbls: Set<string>) => {
  //     notified = true;
  //   });
  // },

  // "can be re-installed on schema change": async (
  //   dbProvider: () => DB,
  //   assert: (p: boolean) => void
  // ) => {
  //   const db = dbProvider();
  //   createSimpleSchema(db);
  //   const rx = await tblrx(db);

  //   db.exec("CREATE TABLE bar (a, b)");
  //   await rx.schemaChanged();

  //   assert(rx.watching.length == 2);

  //   assert(rx.watching[0] == "foo");
  //   assert(rx.watching[1] == "bar");
  // },

  // "does not fatal for connections that have not loaded the rx extension": (
  //   dbProvider: (filename: string) => DB,
  //   assert: (p: boolean) => void
  // ) => {},

  // "can exclude tables from rx": (
  //   dbProvider: () => DB,
  //   assert: (p: boolean) => void
  // ) => {},

  // "disposes of listeners when asked": async (
  //   dbProvider: () => DB,
  //   assert: (p: boolean) => void
  // ) => {
  //   const db = dbProvider();
  //   createSimpleSchema(db);
  //   const rx = await tblrx(db);

  //   let notified = false;
  //   const disposer = rx.on(() => {
  //     notified = true;
  //   });

  //   db.exec("INSERT INTO foo VALUES (1,2)");
  //   db.exec("INSERT INTO foo VALUES (2,3)");
  //   db.exec("DELETE FROM foo WHERE a = 1");

  //   assert(notified == false);
  //   disposer();

  //   await new Promise((resolve) => setTimeout(resolve, 0));

  //   assert(notified == false);
  // },
};
