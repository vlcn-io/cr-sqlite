INSERT INTO "todo" (
  "id",
  "listId",
  "text",
  "completed"
) VALUES (
  1,
  1,
  "first todo",
  0
);

UPDATE "todo" SET "listId" = 2 WHERE "id" = 1;

INSERT INTO "todo" (
  "id",
  "listId",
  "text",
  "completed"
) VALUES (
  1,
  2,
  "first todo redux",
  0
);

DELETE FROM "todo" WHERE "id" = 1;

INSERT INTO "todo" (
  "id",
  "listId",
  "text",
  "completed"
) VALUES (
  1,
  2,
  "resurrect",
  0
);

-- todo_patch should not expose:
-- update_src
-- crr_db_v?
INSERT INTO "todo_patch" (
  "id",
  "listId",
  "listId_v",
  "text",
  "text_v",
  "completed",
  "completed_v",
  "crr_cl",
  "crr_db_v",
  "crr_update_src"
) VALUES (
  1,
  3,
  4,
  "foo",
  0,
  1,
  2,
  7,
  0,
  1
);

-- to find all changes for a given table since peers last saw one another
-- we need to pull the clock too... for that row

-- for each peer that:
  -- has a greater version than provided
  -- or was not provided to us but we have a record of
-- return the todo_id and vector_clock for the row


-- selects todoIds and clocks which have any peer ahead of the provided clock
SELECT "todo_vector_clock"."vc_todoId", json_group_object("vc_peerId", "vc_version") FROM "todo_vector_clock" 
  LEFT JOIN json_each(clock_arg) as provided_clock ON
  provided_clock."key" = "todo_vector_clock"."vc_peerId" AND
  provided_clock."value" < "todo_vector_clock"."version"
  GROUP BY "todo_vector_clock"."vc_todoId";

-- from those todoIds we can then select all the todos and send them over the write with their vector clocks.
-- on receipt of these, the receiver will merge the row and update their vector
-- clock entries with each of the greatest values

-- select min(a.id), b.* from a join b on b.fk = a.id group by b.fk;