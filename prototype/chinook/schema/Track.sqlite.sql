-- SIGNED-SOURCE: <04d175d2203ff1b10d9c380c39c67691>
CREATE TABLE
  IF NOT EXISTS "track" (
    "id" bigint NOT NULL,
    "name" text NOT NULL,
    "albumId" bigint,
    "mediaTypeId" bigint NOT NULL,
    "genreId" bigint,
    "composer" text,
    "milliseconds" int NOT NULL,
    "bytes" int,
    "unitPrice" float NOT NULL,
    primary key ("id")
  )