import * as nanoid from "nanoid";

// import sqliteWasm from "@vlcn.io/crsqlite-wasm";

// const sqlite = await sqliteWasm();
// const db = sqlite.open(":memory:");

// // @ts-ignore
// window.db = db;

// window.onbeforeunload = () => {
//   db.close();
// };

import sqliteWasm from "@vlcn.io/wa-crsqlite";

const sqlite = await sqliteWasm();
const db1 = await sqlite.open(":memory:");

await db1.execMany([
  `CREATE TABLE IF NOT EXISTS todo_list ("name" primary key, "creation_time");`,
  `CREATE TABLE IF NOT EXISTS todo ("id" primary key, "list", "text", "complete");`,
]);
await db1.execMany([
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
await db1.exec(`INSERT OR IGNORE INTO todo_list VALUES ('groceries', ?)`, [
  Date.now(),
]);
await Promise.all(
  list.map((item) =>
    db1.exec(`INSERT INTO todo VALUES (?, 'groceries', ?, 0)`, [
      nanoid.nanoid(),
      item,
    ])
  )
);

list = ["test", "document", "explain", "onboard", "hire"];
await db1.exec(`INSERT OR IGNORE INTO todo_list VALUES ('work', ?)`, [
  Date.now(),
]);
await Promise.all(
  list.map((item) =>
    db1.exec(`INSERT INTO todo VALUES (?, 'work', ?, 0)`, [
      nanoid.nanoid(),
      item,
    ])
  )
);

let groceries = await db1.execO(
  `SELECT "list", "text" FROM "todo" WHERE "list" = 'groceries'`
);
console.log(groceries);
let work = await db1.execO(
  `SELECT "list", "text" FROM "todo" WHERE "list" = 'work'`
);
console.log(work);

let changesets = await db1.execA(
  "SELECT * FROM crsql_changes where version > -1"
);
console.log(changesets);

const db2 = await sqlite.open(":memory:");
await db2.execMany([
  `CREATE TABLE IF NOT EXISTS todo_list ("name" primary key, "creation_time");`,
  `CREATE TABLE IF NOT EXISTS todo ("id" primary key, "list", "text", "complete");`,
  `SELECT crsql_as_crr('todo_list');`,
  `SELECT crsql_as_crr('todo');`,
]);
let changesets2 = await db2.execA(
  "SELECT * FROM crsql_changes where version > -1"
);
console.log(changesets);

const siteid = (await db1.execA(`SELECT crsql_siteid()`))[0][0];
await db2.transaction(async () => {
  for (const cs of changesets) {
    await db2.exec(`INSERT INTO crsql_changes VALUES (?, ?, ?, ?, ?, ?)`, [
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

groceries = await db2.execO(
  `SELECT "list", "text" FROM "todo" WHERE "list" = 'groceries'`
);
console.log(groceries);
work = await db2.execO(
  `SELECT "list", "text" FROM "todo" WHERE "list" = 'work'`
);
console.log(work);

let db1version = (await db1.execA(`SELECT crsql_dbversion()`))[0][0];
let db2version = (await db2.execA(`SELECT crsql_dbversion()`))[0][0];

console.log(db1version);
console.log(db2version);

await db1.exec(`INSERT OR IGNORE INTO todo_list VALUES (?, ?)`, [
  "home",
  Date.now(),
]);
await db2.exec(`INSERT OR IGNORE INTO todo_list VALUES (?, ?)`, [
  "home",
  Date.now(),
]);
// both dbs add some stuff to that list
await db1.exec(`INSERT INTO todo VALUES (?, ?, ?, ?)`, [
  nanoid.nanoid(),
  "home",
  "paint",
  0,
]);
await db2.exec(`INSERT INTO todo VALUES (?, ?, ?, ?)`, [
  nanoid.nanoid(),
  "home",
  "mow",
  0,
]);
await db1.exec(`INSERT INTO todo VALUES (?, ?, ?, ?)`, [
  nanoid.nanoid(),
  "home",
  "water",
  0,
]);
// given each item is a nanoid for primary key, `weed` will show up twice
await db2.exec(`INSERT INTO todo VALUES (?, ?, ?, ?)`, [
  nanoid.nanoid(),
  "home",
  "weed",
  0,
]);
await db1.exec(`INSERT INTO todo VALUES (?, ?, ?, ?)`, [
  nanoid.nanoid(),
  "home",
  "weed",
  0,
]);
// and complete things on other lists
await db1.exec(`UPDATE todo SET complete = 1 WHERE list = 'groceries'`);

let changesets1 = await db1.execA(
  "SELECT * FROM crsql_changes where version > ?",
  [db1version]
);
changesets2 = await db2.execA("SELECT * FROM crsql_changes where version > ?", [
  db2version,
]);

console.log(changesets1);
console.log(changesets2);

// sqlite.base.exec(db.db, "SELECT crsql_siteid()", (r) => {
//   console.log(r);
// });

(window as any).sqlite = sqlite;
