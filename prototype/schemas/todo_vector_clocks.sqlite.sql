CREATE TABLE 
  IF NOT EXISTS "todo_vector_clocks" (
    "vc_todoId" integer NOT NULL,
    "vc_peerId" integer NOT NULL,
    "vc_version" integer NOT NULL,
    PRIMARY KEY ("vc_peerId", "vc_todoId")
  );
