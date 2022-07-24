import connect, { DatabaseConnection, sql } from '@databases/sqlite';
import setupDb from './setupDb.js';
import createInsert from './createInsert.js';

const vanillaTable = sql`CREATE TABLE IF NOT EXISTS "todo" (
  "id" integer NOT NULL,
  "listId" integer NOT NULL,
  "text" text NOT NULL,
  "completed" boolean NOT NULL,
  primary key ("id")
)`;

const crrDb = await setupDb();
const vanillaDb = connect();

await vanillaDb.query(vanillaTable);

async function insertSerially(c: DatabaseConnection, n: number) {
  for (let i = 0; i < n; ++i) {
    await c.query(createInsert(i, i, 'foobar', false));
  }
}

// TODO: crr inserts are getting serialized due to them all writing to the db version table.
// We can extract the db version into a sql extension and provide it as a variable in-memory.
// That _should_ make performance nearly identical which has been verified by changing
// the values to be constants and measuring perf.
// Also move `peer_id` into an extension.
async function insertParallel(c: DatabaseConnection, n: number) {
  await Promise.all(
    Array.from({ length: n }).map((x, i) => c.query(createInsert(i, i, 'foobar', false))),
  );
}

async function insertTx(c: DatabaseConnection, n: number) {}

async function updateSerially(c: DatabaseConnection, n: number) {
  for (let i = 0; i < n; ++i) {
    await c.query(sql`UPDATE "todo" SET "text" = 'Boo' WHERE "id" = ${sql.value(i)}`);
  }
}

async function updateParallel(c: DatabaseConnection, n: number) {
  await Promise.all(
    Array.from({ length: n }).map((x, i) =>
      c.query(sql`UPDATE "todo" SET "text" = 'Boo' WHERE "id" = ${sql.value(i)}`),
    ),
  );
}

async function read(c: DatabaseConnection) {
  await c.query(sql`SELECT * FROM "todo"`);
}

// const testConn = crrDb;
const testConn = vanillaDb;
const testN = 50000;

await insertParallel(testConn, testN);
const start = performance.now();
await updateParallel(testConn, testN);
const end = performance.now();

console.log('DURATION: ' + (end - start));
