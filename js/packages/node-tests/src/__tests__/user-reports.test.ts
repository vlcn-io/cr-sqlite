import { test, expect } from "vitest";
import crsqlite from "@vlcn.io/crsqlite-allinone";
import { extensionPath } from "@vlcn.io/crsqlite";
// @ts-ignore
import SQLite from "better-sqlite3";

// https://discord.com/channels/989870439897653248/989870440585494530/1081084118680485938
test("pk only table", () => {
  const db = crsqlite.open();
  db.exec(`CREATE TABLE IF NOT EXISTS data (id NUMBER PRIMARY KEY)`);
  db.exec(`SELECT crsql_as_crr('data')`);
  db.exec(`INSERT INTO data VALUES (42) ON CONFLICT DO NOTHING`);
  expect(
    db
      .prepare(
        `SELECT "table", "pk", "cid", "val", "col_version", "db_version" FROM crsql_changes`
      )
      .all()
  ).toEqual([
    {
      table: "data",
      pk: Buffer.from(Uint8Array.from([1, 9, 42])),
      cid: "-1",
      val: null,
      col_version: 1,
      db_version: 1,
    },
  ]);
});

// https://discord.com/channels/989870439897653248/989870440585494530/1118123015364939836
test("failed to increment?", () => {
  const database = new SQLite(":memory:");
  database.loadExtension(extensionPath);

  // db_version is incremented with initial other then 'NULL'
  const initial = "NULL"; // "0";

  database.exec(`
    CREATE TABLE a(id PRIMARY KEY, data);
    CREATE TABLE b(id PRIMARY KEY, data);

    SELECT crsql_as_crr('a');
    SELECT crsql_as_crr('b');

    INSERT INTO b VALUES (0, ${initial});
  `);

  database.exec(`
    INSERT INTO a VALUES (10, 123);
    UPDATE b SET data = 10 WHERE data IS ${initial};
  `);
  expect(database.prepare(`SELECT * FROM crsql_changes`).all()).toEqual([
    {
      table: "a",
      pk: Buffer.from(Uint8Array.from([1, 9, 10])),
      cid: "data",
      val: 123,
      col_version: 1,
      db_version: 2,
      site_id: null,
      cl: 1,
    },
    {
      table: "b",
      pk: Buffer.from(Uint8Array.from([1, 1])),
      cid: "data",
      val: 10,
      col_version: 2,
      db_version: 3,
      site_id: null,
      cl: 1,
    },
  ]);
});
