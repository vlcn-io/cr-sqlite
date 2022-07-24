import { DatabaseConnection, sql, SQLQuery } from '@databases/sqlite';
import setupDb, { sqliteFormat } from './setupDb';
import fc from 'fast-check';
import createInsert from './createInsert';
import { currentClockQuery, deltaQuery, deltaQueryWithData, patchQuery } from './replicate';

let dbA: DatabaseConnection;
let dbB: DatabaseConnection;
let dbC: DatabaseConnection;
beforeAll(async () => {
  [dbA, dbB, dbC] = await Promise.all([setupDb(), setupDb(), setupDb()]);
});
afterAll(() => {
  dbA.dispose();
  dbB.dispose();
  dbC.dispose();
});

const table = 'todo';

test('round trip sync', async () => {
  // Create a bunch of random data on all dbs
  await fc.assert(
    fc.asyncProperty(
      fc.integer(),
      fc.integer(),
      fc.string(),
      fc.boolean(),
      async (id, listId, text, completed) => {
        const insert = createInsert(id, listId, text, completed);
        await Promise.all([dbA.query(insert), dbB.query(insert), dbC.query(insert)]);
      },
    ),
  );

  // syncs changes from left to right.
  const sync = async (left: DatabaseConnection, right: DatabaseConnection) => {
    const rightClock = collapseClock(await right.query(currentClockQuery(table)));
    const deltas = await left.query(deltaQueryWithData(table, rightClock));

    await right.query(patchQuery(table, deltas));
  };

  let aClock = collapseClock(await dbA.query(currentClockQuery(table)));
  let baDeltas = await dbB.query(deltaQuery(table, aClock));

  await sync(dbA, dbB);
  let bClock = collapseClock(await dbB.query(currentClockQuery(table)));
  let abDeltas = await dbA.query(deltaQuery(table, bClock));
  // B has nothing it can receive from A given it just merged A into itself.
  expect(abDeltas.length).toEqual(0);

  // db B has changed but it only received data from A.
  // thus the deltas to bring A up to B should not be different.
  let baDeltasNew = await dbB.query(deltaQuery(table, aClock));
  expect(baDeltasNew).toEqual(baDeltas);

  // We merged a -> b
  // now lets merge b -> c -> b -> a to converge all dbs to the same state
  await sync(dbB, dbC);
  await sync(dbC, dbB);
  await sync(dbB, dbA);

  // all dbs should be identical.
  const [aTodos, bTodos, cTodos] = await onAll(sql`SELECT * FROM ${sql.ident(table)}`);
  expect(aTodos).toEqual(bTodos);
  expect(bTodos).toEqual(cTodos);

  const clocks = (await onAll(currentClockQuery(table))).map(collapseClock);
  expect(clocks[0]).toEqual(clocks[1]);
  expect(clocks[1]).toEqual(clocks[2]);

  // make a bunch of random modifications
});

const collapseClock = c =>
  c.reduce((l, r) => {
    l[r.peerId] = r.version;
    return l;
  }, {});

async function onAll(query: SQLQuery): Promise<[any[], any[], any[]]> {
  return await Promise.all([dbA.query(query), dbB.query(query), dbC.query(query)]);
}
