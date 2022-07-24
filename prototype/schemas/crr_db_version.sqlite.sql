CREATE TABLE IF NOT EXISTS "crr_db_version" (
  "id" INTEGER PRIMARY KEY CHECK (id = 0),
  "version" integer DEFAULT 0
);
