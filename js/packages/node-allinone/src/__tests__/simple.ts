import sqlite from "../index.js";

const db = sqlite.open(":memory:");

db.execMany([
  `DROP TABLE IF EXISTS todos;`,
  `DROP TABLE IF EXISTS crsql_site_id;`,
  `DROP TABLE IF EXISTS todos__crsql_clock;`,

  `CREATE TABLE IF NOT EXISTS "crsql_site_id" (site_id);`,
  `INSERT INTO crsql_site_id VALUES(X'dc215665ff164407b63f423a469b7cb9');`,
  `CREATE TABLE IF NOT EXISTS "todos" ("id" text primary key, "title" text, "text" text, "completed" boolean);`,
  `INSERT INTO todos VALUES('xc2yf7z5qb','123','132',0);`,
  `CREATE TABLE IF NOT EXISTS "todos__crsql_clock" ("id","__crsql_col_name" NOT NULL,"__crsql_version" NOT NULL,"__crsql_site_id",PRIMARY KEY ("id", "__crsql_col_name")    );`,

  // This is the duplicate entry:
  `INSERT INTO todos__crsql_clock VALUES('xc2yf7z5qb','title',1,X'af6a922841304d14a443ddbcd36469bc');`,
]);

const change = [
  "title",
  "'xc2yf7z5qb'",
  Uint8Array.from([
    175, 106, 146, 40, 65, 48, 77, 20, 164, 67, 221, 188, 211, 100, 105, 188,
  ]),
  "todos",
  "'123'",
  1,
  1,
];

db.exec(
  `INSERT INTO crsql_changes ("cid", "pk", "site_id", "table", "val", "version", "cl") VALUES (?,?,?,?,?,?,?)`,
  change
);
