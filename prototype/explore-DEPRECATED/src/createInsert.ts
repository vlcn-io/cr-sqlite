import { DatabaseConnection, sql } from '@databases/sqlite';

export default function createInsert(id, listId, text, completed) {
  return sql`INSERT INTO todo (id, listId, text, completed) VALUES (${sql.value(id)}, ${sql.value(
    listId,
  )}, ${sql.value(text)}, ${sql.value(completed)})`;
}
