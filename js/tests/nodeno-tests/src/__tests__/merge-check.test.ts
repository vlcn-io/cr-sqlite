import { test, expect } from "vitest";
import crsqlite, { DB } from "@vlcn.io/crsqlite-allinone";

import fc, { integer } from "fast-check";
import { nanoid } from "nanoid";

const table = "todo";

function setupDb() {
  const db = crsqlite.open();

  db.exec(
    `CREATE TABLE ${table} ("id" primary key, "listId", "completed", "text")`
  );
  db.exec(`SELECT crsql_as_crr('${table}')`);

  return db;
}

export default function createInsert(
  id: string | number,
  listId: string | number,
  text: string,
  completed: boolean
): [string, [string | number, string | number, string, number]] {
  return [
    `INSERT INTO todo ("id", "listId", "text", "completed") VALUES (?, ?, ?, ?)`,
    [id, listId, text, completed ? 1 : 0],
  ];
}

// TODO: test cases where:
// - we use db version
// - we use site id
const sync = (left: DB, right: DB) => {
  // extract changes from left
  const changesets = left.execA("SELECT * FROM crsql_changes");

  // apply changes to right
  right.transaction(() => {
    const stmt = right.prepare(
      "INSERT INTO crsql_changes VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    try {
      for (const cs of changesets) {
        try {
          stmt.run(cs);
        } catch (e) {
          console.log(cs);
          throw e;
        }
      }
    } finally {
      stmt.finalize();
    }
  });
};

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

let todoId = 0;
const randomizedTestCase = (
  mergeType: string,
  operations: string[],
  newCreates: [number, string, boolean][],
  todos: [number, string, boolean][]
) => {
  let dbA: DB;
  let dbB: DB;
  let dbC: DB;
  let dbs: [DB, DB, DB];

  dbs = [dbA, dbB, dbC] = [setupDb(), setupDb(), setupDb()];

  todos.forEach((todo) => {
    const insert = createInsert(++todoId, todo[0], todo[1], todo[2]);
    dbs.forEach((d) => run(d, insert));
  });

  // TODO: add a `centralize` / `hub-spoke` merge type
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
      all(db, [`SELECT * FROM "${table}" ORDER BY id DESC`, []])
    );

    try {
      expect(aTodos).toEqual(bTodos);
      expect(bTodos).toEqual(cTodos);
    } catch (e) {
      console.log("ASS ALL");
      console.log(aTodos);
      console.log(bTodos);
      console.log(cTodos);
      throw e;
    }
  };

  syncAndAssertAll(mergeType as any);

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
            run(db, [`UPDATE todo SET "text" = ? WHERE id = ?`, [nanoid(), id]])
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
          newCreates.forEach((todo) => {
            run(db, createInsert(++todoId, todo[0], todo[1], todo[2]));
          });
          return;
      }
      // randomly decide to merge certain peers?
    });
  });

  syncAndAssertAll(mergeType as any);
  dbs.forEach((db) => db.close());
};

test("randomized inserts, updates, deletes then sync", () => {
  fc.assert(
    fc.property(
      fc.oneof(fc.constant("round-trip"), fc.constant("pairwise")).noShrink(),
      fc
        .shuffledSubarray(["modify", "delete", "reinsert", "create"], {
          minLength: 4,
        })
        .noShrink(),
      fc
        .array(fc.tuple(fc.integer(), fc.string(), fc.boolean()), {
          maxLength: 20,
        })
        .noShrink(),
      fc
        .array(fc.tuple(fc.integer(), fc.string(), fc.boolean()), {
          maxLength: 500,
        })
        .noShrink(),
      randomizedTestCase
    )
  );
});

test("exact failure case", () => {
  randomizedTestCase(
    "pairwise",
    ["create", "delete", "modify", "reinsert"],
    [
      [-1840559893, "`^{ia0", true],
      [-583230762, "AiV", true],
      [1074837721, "l@DP)5", false],
      [-1288003013, "(~8^zZ", false],
      [-2095337014, '`Y^FZh"<M', false],
      [835897636, "zLz~FG", true],
      [-1154335901, "", false],
      [2049618411, ">h39]<kE#", false],
      [-53407480, "'n", true],
    ],
    [
      [1291390942, "}3PO!allis", true],
      [-2147483644, "51rG%\\{M", false],
      [17, "", false],
      [-2147483627, "t", true],
      [-1098916073, "s-fLx\\-qE", true],
      [-20, "${bt<u_h", false],
      [-743568551, "Sz3.O", false],
      [-2147483622, "6", false],
      [1844712160, "ywa#`puz2", false],
      [-21, "CJ", true],
    ]
  );
});
