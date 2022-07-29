-- SIGNED-SOURCE: <dfcff92edef793deab2366d52c95a6f7>
CREATE TABLE
  IF NOT EXISTS "customer" (
    "id" bigint NOT NULL,
    "firstName" text NOT NULL,
    "lastName" text NOT NULL,
    "company" text,
    "address" text,
    "city" text,
    "state" text,
    "country" text,
    "postalCode" text,
    "phone" text,
    "fax" text,
    "email" text NOT NULL,
    "supportRepId" bigint NOT NULL,
    primary key ("id")
  )