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
  Promise.all(
    list.map((item) =>
      db1.exec(`INSERT INTO todo VALUES (?, 'groceries', ?, 0)`, [
        nanoid.nanoid(),
        item,
      ])
    )
  );

  list = ["test", "document", "explain", "onboard", "hire"];
  db1.exec(`INSERT OR IGNORE INTO todo_list VALUES ('work', ?)`, [Date.now()]);
  Promise.all(
    list.map((item) =>
      db1.exec(`INSERT INTO todo VALUES (?, 'work', ?, 0)`, [
        nanoid.nanoid(),
        item,
      ])
    )
  );

  let groceries = db1.execO(
    `SELECT "list", "text" FROM "todo" WHERE "list" = 'groceries'`
  );
  console.log(groceries);
  let work = db1.execO(
    `SELECT "list", "text" FROM "todo" WHERE "list" = 'work'`
  );
  console.log(work);

  let changesets = db1.execA("SELECT * FROM crsql_changes where version > -1");
  console.log(changesets);

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
      db2.exec(`INSERT INTO crsql_changes VALUES (?, ?, ?, ?, ?, ?)`, [
        cs[0],
        cs[1],
        cs[2],
        cs[3],
        cs[4],
        // TODO: the changesets need to always return a site id otherwise they cannot be applied.
        // here we unroll the changeset and put in the site id that is missing due to the bug.
        // https://github.com/vlcn-io/cr-sqlite/issues/39
        siteid,
      ]);
    }
  });

  groceries = db2.execO(
    `SELECT "list", "text" FROM "todo" WHERE "list" = 'groceries'`
  );
  console.log(groceries);
  work = db2.execO(`SELECT "list", "text" FROM "todo" WHERE "list" = 'work'`);
  console.log(work);

  let db1version = db1.execA(`SELECT crsql_dbversion()`)[0][0];
  let db2version = db2.execA(`SELECT crsql_dbversion()`)[0][0];

  console.log(db1version);
  console.log(db2version);

  db1.exec(`INSERT OR IGNORE INTO todo_list VALUES (?, ?)`, [
    "home",
    Date.now(),
  ]);
  db2.exec(`INSERT OR IGNORE INTO todo_list VALUES (?, ?)`, [
    "home",
    Date.now(),
  ]);
});
