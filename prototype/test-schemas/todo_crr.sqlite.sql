CREATE TABLE
  IF NOT EXISTS "todo_crr" (
    "id" integer NOT NULL,
    "listId" integer NOT NULL,
    "listId_v" integer DEFAULT 0,
    "text" text NOT NULL,
    "text_v" integer DEFAULT 0,
    "completed" boolean NOT NULL,
    "completed_v" integer DEFAULT 0,
    "crr_cl" integer DEFAULT 1,
    "crr_update_src" integer DEFAULT 0,
    primary key ("id")
  );