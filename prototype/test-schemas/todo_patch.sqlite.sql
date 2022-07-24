CREATE VIEW
  IF NOT EXISTS "todo_patch" AS SELECT 
    "todo_crr".*,
    '{"fake": 1}' as crr_clock
  FROM "todo_crr"
  