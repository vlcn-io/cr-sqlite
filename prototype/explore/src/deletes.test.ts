import { DatabaseConnection, sql } from '@databases/sqlite';
import setupDb from './setupDb';
import fc from 'fast-check';
import createInsert from './createInsert';

let db: DatabaseConnection;
beforeAll(async () => {
  db = await setupDb();
});
afterAll(() => db.dispose());

let id = 0;
test('Creating then deleting items the re-inserting items', async () => {
  // Use fast check to randomize created data
  const creationValues: (readonly [number, number, string, boolean])[] = [];
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 0 }),
      fc.string(),
      fc.boolean(),
      async (listId, text, completed) => {
        const args = [++id, listId, text, completed] as const;
        creationValues.push(args);
        await db.query(createInsert(...args));
      },
    ),
  );

  // see `inserts.test.ts` for tests against insertion invariants

  // delete everything we just created then check deletion invariants
  const deleteTodos = async () =>
    await Promise.all(
      Array.from({ length: id }).map(
        async (_, i) => await db.query(sql`DELETE FROM "todo" WHERE "id" = ${sql.value(i + 1)}`),
      ),
    );
  await deleteTodos();

  let [todos, crrTodos, clocks] = await Promise.all([
    db.query(sql`SELECT * FROM "todo"`),
    db.query(sql`SELECT * FROM "todo_crr"`),
    db.query(sql`SELECT * FROM "todo_vector_clocks"`),
  ]);

  // todos should be gone
  expect(todos.length).toBe(0);
  // the crr sturctures backing the todos are retained
  expect(crrTodos.length).toBe(id);
  // there should still be no more clocks than before -- only clock values should change with deletes
  // see `inserts.test.ts` for explanation of clocks.length
  expect(clocks.length).toBe(id);

  for (const crrTodo of crrTodos) {
    // the row recorded itself as deleted?
    expect(crrTodo.crr_cl).toBe(2);
    // the row recorded itself as being written by the local process?
    expect(crrTodo.crr_update_src).toBe(0);

    // all versions still 0 since the columns were not touched
    expect(crrTodo.listId_v).toBe(0);
    expect(crrTodo.text_v).toBe(0);
    expect(crrTodo.completed_v).toBe(0);
  }

  const clockVersions = clocks.map(c => c.vc_version).sort();

  expect(clockVersions[0]).toBe(101);
  expect(clockVersions[clockVersions.length - 1]).toBe(200);

  // given all writes came from a single peer, all clocks should have the same peer id
  expect(new Set(clocks.map(c => c.vc_peerId)).size).toBe(1);

  // now lets re-create everything with the exact same values as before.
  await Promise.all(creationValues.map(cv => db.query(createInsert(...cv))));

  [todos, crrTodos, clocks] = await Promise.all([
    db.query(sql`SELECT * FROM "todo"`),
    db.query(sql`SELECT * FROM "todo_crr"`),
    db.query(sql`SELECT * FROM "todo_vector_clocks"`),
  ]);

  // todos should exist again!
  expect(todos.length).toBe(id);
  expect(crrTodos.length).toBe(id);
  expect(clocks.length).toBe(id);

  for (const crrTodo of crrTodos) {
    // the row recorded itself as existing again?
    expect(crrTodo.crr_cl).toBe(3);
    // the row recorded itself as being written by the local process?
    expect(crrTodo.crr_update_src).toBe(0);

    // all versions still 0 since the columns were not modified during resurrection
    expect(crrTodo.listId_v).toBe(0);
    expect(crrTodo.text_v).toBe(0);
    expect(crrTodo.completed_v).toBe(0);
  }

  // delete all todos again then recreate with different values
  await deleteTodos();

  await Promise.all(
    creationValues.map(([id, listId, text, completed]) =>
      db.query(createInsert(id, listId + 1, text + '😅', !completed)),
    ),
  );

  [todos, crrTodos, clocks] = await Promise.all([
    db.query(sql`SELECT * FROM "todo"`),
    db.query(sql`SELECT * FROM "todo_crr"`),
    db.query(sql`SELECT * FROM "todo_vector_clocks"`),
  ]);

  expect(todos.length).toBe(id);
  expect(crrTodos.length).toBe(id);
  expect(clocks.length).toBe(id);

  for (const crrTodo of crrTodos) {
    // the row recorded itself as existing again?
    expect(crrTodo.crr_cl).toBe(5);
    // the row recorded itself as being written by the local process?
    expect(crrTodo.crr_update_src).toBe(0);

    // all versions still 0 since the columns were not modified during resurrection
    expect(crrTodo.listId_v).toBe(1);
    expect(crrTodo.text_v).toBe(1);
    expect(crrTodo.completed_v).toBe(1);
  }
});
