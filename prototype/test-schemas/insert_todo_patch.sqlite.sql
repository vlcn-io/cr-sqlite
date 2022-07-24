CREATE TRIGGER IF NOT EXISTS "insert_todo_patch"
  INSTEAD OF INSERT ON "todo_patch"
BEGIN
-- note: if any column is nullable, null is incomparable so we need to check for null explicitly and take the non-null one.

  INSERT INTO "todo_crr" (
    "id",
    "listId",
    "listId_v",
    "text",
    "text_v",
    "completed",
    "completed_v",
    "crr_cl",
    "crr_update_src"
  ) VALUES (
    NEW."id",
    NEW."listId",
    NEW."listId_v",
    NEW."text",
    NEW."text_v",
    NEW."completed",
    NEW."completed_v",
    NEW."crr_cl",
    1
  ) ON CONFLICT ("id") DO UPDATE SET
    "listId" = CASE
      WHEN EXCLUDED."listId_v" > "listId_v" THEN EXCLUDED."listId"
      WHEN EXCLUDED."listId_v" = "listId_v" THEN
        CASE
          WHEN EXCLUDED."listId" > "listId" THEN EXCLUDED."listId"
          ELSE "listId"
        END
      ELSE "listId"
    END,
    "listId_v" = CASE
      WHEN EXCLUDED."listId_v" > "listId_v" THEN EXCLUDED."listId_v"
      ELSE "listId_v"
    END,
    "text" = CASE
      WHEN EXCLUDED."text_v" > "text_v" THEN EXCLUDED."text"
      WHEN EXCLUDED."text_v" = "text_v" THEN
        CASE
          WHEN EXCLUDED."text" > "text" THEN EXCLUDED."text"
          ELSE "text"
        END
      ELSE "text"
    END,
    "text_v" = CASE
      WHEN EXCLUDED."text_v" > "text_v" THEN EXCLUDED."text_v"
      ELSE "text_v"
    END,
    "completed" = CASE
      WHEN EXCLUDED."completed_v" > "completed_v" THEN EXCLUDED."completed"
      WHEN EXCLUDED."completed_v" = "completed_v" THEN
        CASE
          WHEN EXCLUDED."completed" > "completed" THEN EXCLUDED."completed"
          ELSE "completed"
        END
      ELSE "completed"
    END,
    "completed_v" = CASE
      WHEN EXCLUDED."completed_v" > "completed_v" THEN EXCLUDED."completed_v"
      ELSE "completed_v"
    END,
    "crr_cl" = CASE
      WHEN EXCLUDED."crr_cl" > "crr_cl" THEN EXCLUDED."crr_cl"
      ELSE "crr_cl"
    END,
    "crr_update_src" = 1;

  INSERT INTO "todo_crr_clocks" (
    "siteId",
    "version",
    "id"
  ) SELECT "key" as "siteId", "value" as "version", NEW."id" FROM json_each(NEW.crr_clock) WHERE true
  ON CONFLICT ("siteId", "id") DO UPDATE SET
    "version" = CASE WHEN EXCLUDED."version" > "version" THEN EXCLUDED."version" ELSE "version" END;
END;
