CREATE TABLE 
  IF NOT EXISTS "todo_crr_clocks" (
    "id" integer NOT NULL,
    "siteId" integer NOT NULL,
    "version" integer NOT NULL,
    PRIMARY KEY ("siteId", "id")
  );
