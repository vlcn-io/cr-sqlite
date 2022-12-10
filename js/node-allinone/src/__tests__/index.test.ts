import * as nanoid from "nanoid";
import sqlite from "../index.js";
import { test, expect } from "vitest";

// test that we wrapped correctly
test("failing example", () => {
  const db1 = sqlite.open(":memory:");

  db1.execMany([
    `CREATE TABLE IF NOT EXISTS todo_list ("name" primary key, "creation_time");`,
    `CREATE TABLE IF NOT EXISTS todo ("id" primary key, "list", "text", "complete");`,
  ]);
  db1.execMany([
    `SELECT crsql_as_crr('todo_list');`,
    `SELECT crsql_as_crr('todo');`,
  ]);

  let list = [
    "milk",
    "potatos",
    "avocado",
    "butter",
    "cheese",
    "broccoli",
    "spinach",
  ];
  // `insert or ignore` given this is a notebook and ppl will re-run cells.
  db1.exec(`INSERT OR IGNORE INTO todo_list VALUES ('groceries', ?)`, [
    Date.now(),
  ]);
  list.forEach((item) =>
    db1.exec(`INSERT INTO todo VALUES (?, 'groceries', ?, 0)`, [
      nanoid.nanoid(),
      item,
    ])
  );

  list = ["test", "document", "explain", "onboard", "hire"];
  db1.exec(`INSERT OR IGNORE INTO todo_list VALUES ('work', ?)`, [Date.now()]);
  list.forEach((item) =>
    db1.exec(`INSERT INTO todo VALUES (?, 'work', ?, 0)`, [
      nanoid.nanoid(),
      item,
    ])
  );

  let groceries = db1.execO(
    `SELECT "list", "text" FROM "todo" WHERE "list" = 'groceries'`
  );
  let work = db1.execO(
    `SELECT "list", "text" FROM "todo" WHERE "list" = 'work'`
  );

  let changesets = db1.execA("SELECT * FROM crsql_changes where version > -1");

  const db2 = sqlite.open(":memory:");
  db2.execMany([
    `CREATE TABLE IF NOT EXISTS todo_list ("name" primary key, "creation_time");`,
    `CREATE TABLE IF NOT EXISTS todo ("id" primary key, "list", "text", "complete");`,
    `SELECT crsql_as_crr('todo_list');`,
    `SELECT crsql_as_crr('todo');`,
  ]);

  const siteid = db1.execA(`SELECT crsql_siteid()`)[0][0];
  db2.transaction(() => {
    for (const cs of changesets) {
      db2.exec(`INSERT INTO crsql_changes VALUES (?, ?, ?, ?, ?, ?)`, cs);
    }
  });

  groceries = db2.execO(
    `SELECT "list", "text" FROM "todo" WHERE "list" = 'groceries'`
  );
  work = db2.execO(`SELECT "list", "text" FROM "todo" WHERE "list" = 'work'`);

  let db1version = db1.execA(`SELECT crsql_dbversion()`)[0][0];
  let db2version = db2.execA(`SELECT crsql_dbversion()`)[0][0];

  db1.exec(`INSERT OR IGNORE INTO todo_list VALUES (?, ?)`, [
    "home",
    Date.now(),
  ]);
  db2.exec(`INSERT OR IGNORE INTO todo_list VALUES (?, ?)`, [
    "home",
    Date.now(),
  ]);
  db1.exec(`INSERT INTO todo VALUES (?, ?, ?, ?)`, [
    nanoid.nanoid(),
    "home",
    "paint",
    0,
  ]);
  db2.exec(`INSERT INTO todo VALUES (?, ?, ?, ?)`, [
    nanoid.nanoid(),
    "home",
    "mow",
    0,
  ]);
  db1.exec(`INSERT INTO todo VALUES (?, ?, ?, ?)`, [
    nanoid.nanoid(),
    "home",
    "water",
    0,
  ]);
  // given each item is a nanoid for primary key, `weed` will show up twice
  db2.exec(`INSERT INTO todo VALUES (?, ?, ?, ?)`, [
    nanoid.nanoid(),
    "home",
    "weed",
    0,
  ]);
  db1.exec(`INSERT INTO todo VALUES (?, ?, ?, ?)`, [
    nanoid.nanoid(),
    "home",
    "weed",
    0,
  ]);
  // and complete things on other lists
  db1.exec(`UPDATE todo SET complete = 1 WHERE list = 'groceries'`);

  let changesets1 = db1.execA("SELECT * FROM crsql_changes where version > ?", [
    db1version,
  ]);
  let changesets2 = db2.execA("SELECT * FROM crsql_changes where version > ?", [
    db2version,
  ]);
});

test("failing two -- discord: https://discord.com/channels/989870439897653248/989870440585494530/1051181193644736663", () => {
  const db = sqlite.open(":memory:");

  db.execMany([
    `DROP TABLE IF EXISTS todos;`,
    `DROP TABLE IF EXISTS __crsql_siteid;`,
    `DROP TABLE IF EXISTS todos__crsql_clock;`,

    `CREATE TABLE IF NOT EXISTS "__crsql_siteid" (site_id);`,
    `INSERT INTO __crsql_siteid VALUES(X'dc215665ff164407b63f423a469b7cb9');`,
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
  ];

  db.exec(
    `INSERT INTO crsql_changes ("cid", "pk", "site_id", "table", "val", "version") VALUES (?,?,?,?,?,?)`,
    change
  );
});
