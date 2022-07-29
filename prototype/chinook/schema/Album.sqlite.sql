-- SIGNED-SOURCE: <9b13b279fa99a997dcce67c7fc0bf4ff>
CREATE TABLE
  IF NOT EXISTS "album" (
    "id" bigint NOT NULL,
    "title" text NOT NULL,
    "artistId" bigint NOT NULL,
    primary key ("id")
  )