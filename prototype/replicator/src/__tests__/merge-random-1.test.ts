import { Database as DB } from "better-sqlite3";
import setupDb from "./setupDb";
import createInsert from "./createInsert";
import fc from "fast-check";
import queries from "../queries";
import clock from "../clock";

let dbA: DB;
let dbB: DB;
let dbC: DB;
let dbs: [DB, DB, DB];

beforeAll(async () => {
  dbs = [dbA, dbB, dbC] = [setupDb(), setupDb(), setupDb()];
});
afterAll(() => {
  dbs.forEach((db) => db.close());
});

const table = "todo";

test("round trip sync", async () => {
  // Create a bunch of random data on all dbs
  fc.assert(
    fc.property(
      fc.integer(),
      fc.integer(),
      fc.string(),
      fc.boolean(),
      (id, listId, text, completed) => {
        const insert = createInsert(id, listId, text, completed);
        dbs.forEach((d) => run(d, insert));
      }
    )
  );

  // syncs changes from left to right.
  const sync = (left: DB, right: DB) => {
    const rightClock = clock.collapse(all(right, queries.currentClock(table)));
    const deltas = all(left, queries.deltas(table, "id", rightClock));

    run(right, queries.patch(table, deltas));
  };

  let aClock = clock.collapse(all(dbA, queries.currentClock(table)));
  let baDeltas = all(dbB, queries.deltas(table, "id", aClock));

  sync(dbA, dbB);
  let bClock = clock.collapse(all(dbB, queries.currentClock(table)));
  let abDeltas = all(dbA, queries.deltas(table, "id", bClock));
  // B has nothing it can receive from A given it just merged A into itself.
  expect(abDeltas.length).toEqual(0);

  // db B has changed but it only received data from A.
  // thus the deltas to bring A up to B should not be different.
  let baDeltasNew = all(dbB, queries.deltas(table, "id", aClock));
  baDeltasNew.forEach((d) => delete d.crr_update_src);
  baDeltas.forEach((d) => delete d.crr_update_src);
  expect(baDeltasNew).toEqual(baDeltas);

  // We merged a -> b
  // now lets merge b -> c -> b -> a to converge all dbs to the same state
  sync(dbB, dbC);
  sync(dbC, dbB);
  sync(dbB, dbA);

  // all dbs should be identical.
  const [aTodos, bTodos, cTodos] = dbs.map((db) =>
    all(db, [`SELECT * FROM "${table}"`, []])
  );

  expect(aTodos).toEqual(bTodos);
  expect(bTodos).toEqual(cTodos);

  const clocks = dbs
    .map((db) => all(db, queries.currentClock(table)))
    .map(clock.collapse);
  expect(clocks[0]).toEqual(clocks[1]);
  expect(clocks[1]).toEqual(clocks[2]);

  // make a bunch of random modifications
});

function run(db: DB, q: [string, any[]]) {
  db.prepare(q[0]).run(...q[1]);
}

function all(db: DB, q: [string, any[]]) {
  return db.prepare(q[0]).all(...q[1]);
}
