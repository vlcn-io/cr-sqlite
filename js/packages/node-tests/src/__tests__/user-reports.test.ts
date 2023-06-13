import { test, expect } from "vitest";
import crsqlite from "@vlcn.io/crsqlite-allinone";

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
      pk: "42",
      cid: "__crsql_pko",
      val: null,
      col_version: 1,
      db_version: 1,
    },
  ]);
});

// https://discord.com/channels/989870439897653248/989870440585494530/1118123015364939836
test("failed to increment?", () => {});
