import { test, expect } from "vitest";
import crsqlite from "@vlcn.io/crsqlite-allinone";

test("automigrate", () => {
  const db = crsqlite.open();
  const schema = /*sql*/ `
      CREATE TABLE IF NOT EXISTS test (id PRIMARY KEY, name TEXT);
      SELECT crsql_as_crr('test');
    `;
  db.exec(`SELECT crsql_automigrate(?);`, [schema]);
  const updatedSchema = /*sql*/ `
      CREATE TABLE IF NOT EXISTS test (id PRIMARY KEY, name TEXT, time INTEGER);
      SELECT crsql_as_crr('test');
    `;
  db.exec(`SELECT crsql_automigrate(?);`, [updatedSchema]);

  const db2 = crsqlite.open();
  const schema2 = `CREATE TABLE IF NOT EXISTS test (id PRIMARY KEY, name TEXT);
SELECT crsql_as_crr('test');
`;
  db2.exec(`SELECT crsql_automigrate(?);`, [schema]);
});
