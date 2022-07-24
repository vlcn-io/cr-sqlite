CREATE TRIGGER IF NOT EXISTS "update_todo_trig"
  INSTEAD OF UPDATE ON "todo"
BEGIN
  -- nit: noops updates update db version :/
  UPDATE "crr_db_version" SET "version" = "version" + 1;

  UPDATE "todo_crr" SET
    "listId" = NEW."listId",
    "listId_v" = CASE WHEN OLD."listId" != NEW."listId" THEN "listId_v" + 1 ELSE "listId_v" END,
    "text" = NEW."text",
    "text_v" = CASE WHEN OLD."text" != NEW."text" THEN "text_v" + 1 ELSE "text_v" END,
    "completed" = NEW."completed",
    "completed_v" = CASE WHEN OLD."completed" != NEW."completed" THEN "completed_v" + 1 ELSE "completed_v" END,
    "crr_update_src" = 0
  WHERE "id" = NEW."id";

  UPDATE "todo_crr_clocks" SET
    "version" = (SELECT "version" FROM "crr_db_version")
  WHERE "siteId" = (SELECT "id" FROM "crr_peer_id") AND "id" = NEW."id";
END;