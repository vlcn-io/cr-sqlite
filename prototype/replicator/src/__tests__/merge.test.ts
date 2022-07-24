import { Database as DB } from "better-sqlite3";
import setupDb from "./setupDb";
import createInsert from "./createInsert";
import fc from "fast-check";
import queries from "../queries";
import clock from "../clock";

let dbA: DB;
let dbB: DB;
let dbC: DB;
let dbs: DB[];

beforeAll(() => {
  [dbA, dbB, dbC] = [setupDb(), setupDb(), setupDb()];
  dbs = [dbA, dbB, dbC];
});

let id = 0;
const table = "todo";
// Not a very DRY test...
// we should dry it out but without adding much complexity.
test("Discovering deltas between diverging datasets", () => {
  // Start all dbs off at identical states
  fc.assert(
    fc.property(
      fc.integer(),
      fc.string(),
      fc.boolean(),
      (listId, text, completed) => {
        const insert = createInsert(++id, listId, text, completed);
        dbs.forEach((d) => run(d, insert));
      }
    )
  );

  let [aClock, bClock, cClock] = dbs
    .map((d) => all(d, queries.currentClock(table)))
    .map(clock.collapse);

  expect(Object.values(aClock).length).toBe(1);
  expect(Object.values(bClock).length).toBe(1);
  expect(Object.values(cClock).length).toBe(1);

  expect(
    Object.values(aClock)[0] === Object.values(bClock)[0] &&
      Object.values(bClock)[0] === Object.values(cClock)[0]
  ).toBe(true);

  // dbs are identical but we never exchanged clocks between dbs.
  // thus the dbs will think they are out of sync.

  // Compute all directions of deltas (we don't need to do this in reality -- just for testing)
  // Since dbs are exact but no clocks were exchanged all deltas should match.
  let [abDeltas, bcDeltas, acDeltas, baDeltas, cbDeltas, caDeltas] = [
    all(dbA, queries.deltaPrimaryKeys(table, bClock)),
    all(dbB, queries.deltaPrimaryKeys(table, cClock)),
    all(dbA, queries.deltaPrimaryKeys(table, cClock)),
    all(dbB, queries.deltaPrimaryKeys(table, aClock)),
    all(dbC, queries.deltaPrimaryKeys(table, bClock)),
    all(dbC, queries.deltaPrimaryKeys(table, aClock)),
  ];

  // Delta ids... should we return full deltas?
  expect(abDeltas.length).toBe(id);
  expect(abDeltas.map((x) => x.id)).toEqual(bcDeltas.map((x) => x.id));
  expect(bcDeltas.map((x) => x.id)).toEqual(acDeltas.map((x) => x.id));
  expect(baDeltas.map((x) => x.id)).toEqual(cbDeltas.map((x) => x.id));
  expect(cbDeltas.map((x) => x.id)).toEqual(caDeltas.map((x) => x.id));

  const peerIdA = Object.keys(aClock)[0];
  const peerIdB = Object.keys(bClock)[0];
  const peerIdC = Object.keys(cClock)[0];

  // Force clocks to partiy -- this is not a normal method of interacting with the CRR DB.
  // done for testing so we can test starting at identical databases.
  const combinedClock = {
    ...aClock,
    ...bClock,
    ...cClock,
  };

  Array.from({ length: id }).forEach((_, i) => {
    const q = `INSERT INTO "todo_crr_clocks" ("siteId", "version", "id") VALUES (?, ?, ?)`;
    run(dbA, [q, [peerIdB, i + 1, i + 1]]);
    run(dbA, [q, [peerIdC, i + 1, i + 1]]);
    run(dbB, [q, [peerIdA, i + 1, i + 1]]);
    run(dbB, [q, [peerIdC, i + 1, i + 1]]);
    run(dbC, [q, [peerIdA, i + 1, i + 1]]);
    run(dbC, [q, [peerIdB, i + 1, i + 1]]);
  });

  // All clocks should now be identical.
  [aClock, bClock, cClock] = dbs
    .map((d) => all(d, queries.currentClock(table)))
    .map(clock.collapse);
  expect(aClock).toEqual(bClock);
  expect(bClock).toEqual(cClock);
  // and equal to the combined clock
  expect(combinedClock).toEqual(cClock);

  // recompute deltas in all directions. There should be no deltas.
  [abDeltas, bcDeltas, acDeltas, baDeltas, cbDeltas, caDeltas] = [
    all(dbA, queries.deltaPrimaryKeys(table, bClock)),
    all(dbB, queries.deltaPrimaryKeys(table, cClock)),
    all(dbA, queries.deltaPrimaryKeys(table, cClock)),
    all(dbB, queries.deltaPrimaryKeys(table, aClock)),
    all(dbC, queries.deltaPrimaryKeys(table, bClock)),
    all(dbC, queries.deltaPrimaryKeys(table, aClock)),
  ];

  expect(
    abDeltas.length +
      bcDeltas.length +
      acDeltas.length +
      baDeltas.length +
      cbDeltas.length +
      caDeltas.length
  ).toBe(0);

  // ok, now that dbs are identical, start editing them to diverge
  // edit todo-1 on A, replicate it to B the replicate it to C
  // after all these replications, db states should match.

  // Make changes on A
  // Merge them into B
  // Merge B into C
  // Check that A, B, C are equivalent
  run(dbA, [`UPDATE "todo" SET "text" = 'achange' WHERE id = 1`, []]);
  aClock = clock.collapse(all(dbA, queries.currentClock(table)));

  // trying to get deltas with a dominating clock should return nothing
  [baDeltas, caDeltas] = [
    all(dbB, queries.deltaPrimaryKeys(table, aClock)),
    all(dbC, queries.deltaPrimaryKeys(table, aClock)),
  ];

  expect(baDeltas.length + caDeltas.length).toBe(0);

  [abDeltas, acDeltas] = [
    all(dbA, queries.deltaPrimaryKeys(table, bClock)),
    all(dbA, queries.deltaPrimaryKeys(table, cClock)),
  ];

  let expected = [{ id: 1n, crr_clock: '{"' + peerIdA + '":101}' }];
  expect(abDeltas).toEqual(expected);
  expect(acDeltas).toEqual(expected);

  // Get the patch.
  let patchBtoA = all(dbA, queries.deltas(table, "id", bClock));

  run(dbB, queries.patch(table, patchBtoA));

  let [syncedRowA, syncedRowB] = [
    all(dbA, [`SELECT * FROM todo_crr WHERE id = 1`, []]),
    all(dbB, [`SELECT * FROM todo_crr WHERE id = 1`, []]),
  ];

  // update_src should be different
  expect(syncedRowA[0].crr_update_src).toBe(0n); // local write
  expect(syncedRowB[0].crr_update_src).toBe(1n); // remote merge
  // everything else should be exactly the same
  delete syncedRowA[0].crr_update_src;
  delete syncedRowB[0].crr_update_src;
  expect(syncedRowA).toEqual(syncedRowB);
});

function run(db: DB, q: [string, any[]]) {
  db.prepare(q[0]).run(...q[1]);
}

function all(db: DB, q: [string, any[]]) {
  return db.prepare(q[0]).all(...q[1]);
}
