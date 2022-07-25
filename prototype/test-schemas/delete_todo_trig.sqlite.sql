CREATE TRIGGER IF NOT EXISTS "delete_todo_trig"
  INSTEAD OF DELETE ON "todo"
BEGIN
  UPDATE "crr_db_version" SET "version" = "version" + 1;

  UPDATE "todo_crr" SET "crr_cl" = "crr_cl" + 1, "crr_update_src" = 0 WHERE "id" = OLD."id";

  INSERT INTO "todo_crr_clocks" ("siteId", "version", "id")
    VALUES (
      (SELECT "id" FROM "crr_site_id"),
      (SELECT "version" FROM "crr_db_version"),
      OLD."id"
    )
    ON CONFLICT ("siteId", "id") DO UPDATE SET
      "version" = EXCLUDED."version";
END;