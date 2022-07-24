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
test('Inserting many items', async () => {
  // Use fast check to randomize data for us.
  await fc.assert(
    fc.asyncProperty(fc.integer(), fc.string(), fc.boolean(), async (listId, text, completed) => {
      await db.query(createInsert(++id, listId, text, completed));
    }),
  );

  const [todos, crrTodos, clocks] = await Promise.all([
    db.query(sql`SELECT * FROM "todo"`),
    db.query(sql`SELECT * FROM "todo_crr"`),
    db.query(sql`SELECT * FROM "todo_vector_clocks"`),
  ]);

  // since we're auto-incr ids on the application end this works.
  expect(todos.length).toBe(id);
  expect(crrTodos.length).toBe(id);

  // this is only the case because we have a single peer.
  // the length in a multi-peer system would be todos.length * num_peers;
  // this is not to mean that there are that many clocks but rather that each clock has an entry for each peer.
  // and each row has a single clock.
  expect(clocks.length).toBe(id);

  for (const crrTodo of crrTodos) {
    // the row recorded itself as existing? (i.e., not deleted)
    expect(crrTodo.crr_cl).toBe(1);
    // the row recorded itself as being written by the local process?
    expect(crrTodo.crr_update_src).toBe(0);

    // all versions start at 0 for new rows
    expect(crrTodo.listId_v).toBe(0);
    expect(crrTodo.text_v).toBe(0);
    expect(crrTodo.completed_v).toBe(0);
  }

  for (const clock of clocks) {
    // clock values increase with every database mutation.
    // given we serially insert todos, do nothing else and increment todo ids
    // the clock values should match the todo ids.
    expect(clock.vc_todoId).toBe(clock.vc_version);
  }

  // given all writes came from a single peer, all clocks should have the same peer id
  expect(new Set(clocks.map(c => c.vc_peerId)).size).toBe(1);
});
