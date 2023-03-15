import sqliteWasm from "@vlcn.io/crsqlite-wasm";
// @ts-ignore
import wasmUrl from "@vlcn.io/crsqlite-wasm/crsqlite.wasm?url";
const crsqlite = await sqliteWasm((file) => wasmUrl);

describe("wa-sqlite-wrapper.cy.ts", () => {
  it("rolls back transactions on failure", async () => {
    const db = await crsqlite.open();
    await db.exec("CREATE TABLE foo (a);");

    try {
      await db.tx(async (tx) => {
        await tx.exec("INSERT INTO foo VALUES (1);");
        throw new Error();
      });
    } catch (e) {}

    const fooCount = await db.execA("SELECT count(*) FROM foo");
    expect(fooCount[0][0]).to.equal(0);
  });

  it("commits transactions on success", async () => {
    const db = await crsqlite.open();
    await db.exec("CREATE TABLE foo (a);");

    await db.tx(async (tx) => {
      await tx.exec("INSERT INTO foo VALUES (1);");
    });

    const fooCount = await db.execA("SELECT count(*) FROM foo");
    expect(fooCount[0][0]).to.equal(1);
  });

  it("serializes access to wa-sqlite", async () => {
    const db = await crsqlite.open();
    await db.exec("CREATE TABLE foo (a);");

    // just need the following to not throw
    await Promise.all([
      db.exec("INSERT INTO foo VALUES (1)"),
      db.exec("INSERT INTO foo VALUES (2)"),
      db.exec("INSERT INTO foo VALUES (3)"),
      db.exec("INSERT INTO foo VALUES (4)"),
      db.exec("INSERT INTO foo VALUES (5)"),
      db.exec("INSERT INTO foo VALUES (6)"),
    ]);
  });
});

// TODO:
// test transaction coordination
