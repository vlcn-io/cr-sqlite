CREATE TRIGGER IF NOT EXISTS "delete_todo_trig"
  INSTEAD OF DELETE ON "todo"
BEGIN
  UPDATE "crr_db_version" SET "version" = "version" + 1;

  UPDATE "todo_crr" SET "crr_cl" = "crr_cl" + 1, "crr_update_src" = 0 WHERE "id" = OLD."id";

  UPDATE "todo_vector_clocks" SET
    "vc_version" = (SELECT "version" FROM "crr_db_version")
  WHERE "vc_peerId" = (SELECT "id" FROM "crr_peer_id") AND "vc_todoId" = OLD."id";
END;