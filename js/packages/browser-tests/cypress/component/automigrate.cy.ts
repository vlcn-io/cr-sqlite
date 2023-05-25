import sqliteWasm from "@vlcn.io/crsqlite-wasm";
// @ts-ignore
import wasmUrl from "@vlcn.io/crsqlite-wasm/crsqlite.wasm?url";
const crsqlite = await sqliteWasm((file) => wasmUrl);

describe("automigrate.cy.ts", () => {
  it("handles column addition", async () => {
    const db = await crsqlite.open();
    const schema = /*sql*/ `
      CREATE TABLE IF NOT EXISTS test (id PRIMARY KEY, name TEXT);
      SELECT crsql_as_crr('test');
    `;
    await db.exec(schema);
    const updatedSchema = /*sql*/ `
      CREATE TABLE IF NOT EXISTS test (id PRIMARY KEY, name TEXT, time INTEGER);
      SELECT crsql_as_crr('test');
    `;
    await db.exec(`SELECT crsql_automigrate(?);`, [updatedSchema]);
  });
});
