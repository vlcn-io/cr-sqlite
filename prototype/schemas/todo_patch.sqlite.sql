CREATE VIEW
  IF NOT EXISTS "todo_patch" AS SELECT 
    "todo_crr"."id",
    "todo_crr"."listId",
    "todo_crr"."listId_v",
    "todo_crr"."text",
    "todo_crr"."text_v",
    "todo_crr"."completed",
    "todo_crr"."completed_v",
    "todo_crr"."crr_cl",
    "vector_clock" as "vector_clock"
  FROM "todo_crr"