-- SIGNED-SOURCE: <4caf2f0258229789ca988523f5f4d771>
CREATE TABLE
  IF NOT EXISTS "employee" (
    "id" bigint NOT NULL,
    "lastName" text NOT NULL,
    "firstName" text NOT NULL,
    "title" text,
    "reportsToId" bigint,
    "birthdate" bigint,
    "hiredate" bigint,
    "address" text,
    "city" text,
    "state" text,
    "country" text,
    "postalCode" text,
    "phone" text,
    "fax" text,
    "email" text,
    primary key ("id")
  )