CREATE TRIGGER IF NOT EXISTS "insert_todo_trig"
  INSTEAD OF INSERT ON "todo"
BEGIN
  -- todo: is there a better way to grab this version?
  -- sucks to use a single incr value across all writes to all tables.
  -- we could do table rather than global db versions...
  -- and maybe we can move the version into an extension
  -- populate the version on startup based on max value for self in clock table.
  UPDATE "crr_db_version" SET "version" = "version" + 1;

  INSERT INTO "todo_crr" (
    "id",
    "listId",
    "listId_v",
    "text",
    "text_v",
    "completed",
    "completed_v",
    "crr_cl"
  ) VALUES (
    NEW."id",
    NEW."listId",
    0,
    NEW."text",
    0,
    NEW."completed",
    0,
    1
  ) ON CONFLICT ("id") DO UPDATE SET
    "listId" = EXCLUDED."listId",
    "listId_v" = CASE WHEN EXCLUDED."listId" != "listId" THEN "listId_v" + 1 ELSE "listId_v" END,
    "text" = EXCLUDED."text",
    "text_v" = CASE WHEN EXCLUDED."text" != "text" THEN "text_v" + 1 ELSE "text_v" END,
    "completed" = EXCLUDED."completed",
    "completed_v" = CASE WHEN EXCLUDED."completed" != "completed" THEN "completed_v" + 1 ELSE "completed_v" END,
    "crr_cl" = CASE WHEN "crr_cl" % 2 = 0 THEN "crr_cl" + 1 ELSE "crr_cl" END,
    "crr_update_src" = 0;
  
  INSERT INTO "todo_crr_clocks" ("siteId", "version", "id")
    VALUES (
      (SELECT "id" FROM "crr_peer_id"),
      (SELECT "version" FROM "crr_db_version"),
      NEW."id"
    )
    ON CONFLICT ("siteId", "id") DO UPDATE SET
      "version" = EXCLUDED."version";
END;