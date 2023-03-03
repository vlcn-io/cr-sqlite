import { test, expect } from "vitest";
import crsqlite from "@vlcn.io/crsqlite-allinone";

// https://discord.com/channels/989870439897653248/989870440585494530/1081084118680485938
test("pk only table", () => {
  const db = crsqlite.open();
  db.exec(`CREATE TABLE IF NOT EXISTS data (id NUMBER PRIMARY KEY)`);
  db.exec(`SELECT crsql_as_crr('data')`);
  db.exec(`INSERT INTO data VALUES (42) ON CONFLICT DO NOTHING`);
  console.log(db.prepare(`SELECT * FROM data`).all());
  console.log(db.prepare(`SELECT * FROM crsql_changes`).all());
});
