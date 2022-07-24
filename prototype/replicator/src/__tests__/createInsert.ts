export default function createInsert(
  id: string | number,
  listId: string | number,
  text: string,
  completed: boolean
): [string, [string | number, string | number, string, number]] {
  return [
    `INSERT INTO todo (id, listId, text, completed) VALUES (?, ?, ?, ?)`,
    [id, listId, text, completed ? 1 : 0],
  ];
}
