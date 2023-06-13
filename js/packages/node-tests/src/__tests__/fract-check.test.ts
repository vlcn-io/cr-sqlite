import { test, expect } from "vitest";
import crsqlite from "@vlcn.io/crsqlite-allinone";
import fc from "fast-check";

function setupDb() {
  const db = crsqlite.open();

  db.exec(`CREATE TABLE todo (id primary key, list_id, ordering, content)`);
  db.exec(`SELECT crsql_as_crr('todo')`);
  db.exec(`SELECT crsql_fract_as_ordered('todo', 'ordering', 'list_id')`);

  return db;
}

/*
op: insert, update, conflict
after: 
*/

// prepend append test
test("prepend append", () => {
  fc.assert(
    fc.property(
      fc.array(fc.oneof(fc.constant(1), fc.constant(-1))),
      (operations) => {
        const db = setupDb();

        const expected = [];
        let id = 1;
        for (const op of operations) {
          if (op == 1) {
            expected.push(id);
          } else {
            expected.unshift(id);
          }

          db.exec(`INSERT INTO todo VALUES (${id}, 1, ${op}, 'test')`);
          ++id;
        }

        let actual = db
          .execA("SELECT id FROM todo ORDER BY ordering")
          .map((r) => r[0]);
        expect(actual).toEqual(expected);
      }
    )
  );
});

// Insert after test. Move down the line.
test("insert after", () => {
  const db = setupDb();
  const expected = [];
  for (let i = 1; i <= 10; ++i) {
    db.exec(`INSERT INTO todo VALUES (${i}, 1, 1, 'test')`);
    expected.push(i);
  }

  for (let i = 11; i < 20; ++i) {
    db.exec(
      `INSERT INTO todo_fractindex (id, list_id, content, after_id) VALUES (${i}, 1, 'test', ${
        i - 10
      })`
    );
    expected.splice((i - 11) * 2 + 1, 0, i);
  }

  let actual = db
    .execA("SELECT id FROM todo ORDER BY ordering")
    .map((r) => r[0]);
  // console.log(expected);
  // console.log(actual);
  expect(actual).toEqual(expected);
});

// Update after test. Move down the line.

// Easy move test
