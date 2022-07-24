CREATE VIEW
  IF NOT EXISTS "todo" AS SELECT
    "id",
    "listId",
    "text",
    "completed"
  FROM
    "todo_crr"
  WHERE
    "todo_crr"."crr_cl" % 2 = 1;