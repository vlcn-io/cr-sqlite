import { Database as DB } from "better-sqlite3";
import setupDb from "./setupDb";
import createInsert from "./createInsert";
import fc, { integer } from "fast-check";
import queries from "../queries";
import clock from "../clock";
import { nanoid } from "nanoid";

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

test("randomized inserts, updates, deletes then sync", async () => {
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

  const sync = (left: DB, right: DB) => {
    const rightClock = clock.collapse(all(right, queries.currentClock(table)));
    const deltas = all(left, queries.deltas(table, "id", rightClock));

    run(right, queries.patch(table, deltas));
  };

  const syncAndAssertAll = (mergeType: "round-trip" | "pairwise") => {
    if (mergeType === "round-trip") {
      sync(dbA, dbB);
      sync(dbB, dbC);
      sync(dbC, dbB);
      sync(dbB, dbA);
    } else {
      sync(dbA, dbB);
      sync(dbA, dbC);
      sync(dbB, dbC);
      sync(dbB, dbA);
      sync(dbC, dbB);
      sync(dbC, dbA);
    }

    assertAll();
  };

  const assertAll = () => {
    const [aTodos, bTodos, cTodos] = dbs.map((db) =>
      all(db, [`SELECT * FROM "${table}"`, []])
    );

    expect(aTodos).toEqual(bTodos);
    expect(bTodos).toEqual(cTodos);
  };

  syncAndAssertAll("round-trip");

  // randomize the set of operations to apply to the dbs
  const operations = shuffle(["modify", "delete", "reinsert", "create"]);
  const mergeType = (["round-trip", "pairwise"] as const)[
    Math.floor(Math.random() * 2)
  ];

  operations.forEach((op) => {
    shuffle(dbs);
    const applyTo = dbs.slice(Math.floor(Math.random() * dbs.length));
    applyTo.forEach((db) => {
      const allIds = shuffle(
        all(db, ["SELECT id FROM todo", []]).map((r) => r.id)
      );
      const toChange = allIds.slice(
        0,
        Math.floor(Math.random() * allIds.length)
      );

      switch (op) {
        case "modify":
          toChange.forEach((id) =>
            run(db, ["UPDATE todo SET text = ? WHERE id = ?", [nanoid(), id]])
          );
          return;
        case "delete":
          toChange.forEach((id) =>
            run(db, ["DELETE FROM todo WHERE id = ?", [id]])
          );
          return;
        case "reinsert":
          // need to track deletes on a given db and re-insert there
          return;
        case "create":
          for (let i = 0; i < Math.random() * 10; ++i) {
            run(
              db,
              createInsert(
                Math.floor(Math.random() * Number.MAX_SAFE_INTEGER),
                Math.floor(Math.random() * 1000),
                nanoid(),
                false
              )
            );
          }
          return;
      }
      // randomly decide to merge certain peers?
    });
  });

  syncAndAssertAll("round-trip");
});

function run(db: DB, q: [string, any[]]) {
  db.prepare(q[0]).run(...q[1]);
}

function all(db: DB, q: [string, any[]]) {
  return db.prepare(q[0]).all(...q[1]);
}

function shuffle<T>(array: T[]) {
  let currentIndex = array.length,
    randomIndex;

  // While there remain elements to shuffle.
  while (currentIndex != 0) {
    // Pick a remaining element.
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex],
      array[currentIndex],
    ];
  }

  return array;
}
