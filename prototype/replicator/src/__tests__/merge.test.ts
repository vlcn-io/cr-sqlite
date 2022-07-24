import { Database as DB } from "better-sqlite3";
import setupDb from "./setupDb";
import createInsert from "./createInsert";
import fc from "fast-check";

let dbA: DB;
let dbB: DB;
let dbC: DB;
let dbs: DB[];

beforeAll(() => {
  [dbA, dbB, dbC] = [setupDb(), setupDb(), setupDb()];
  dbs = [dbA, dbB, dbC];
});

let id = 0;
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
});

function run(db: DB, q: [string, any[]]) {
  db.prepare(q[0]).run(...q[1]);
}
