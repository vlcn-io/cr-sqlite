-- SIGNED-SOURCE: <a329098831e5250b14438de444885727>
CREATE TABLE
  IF NOT EXISTS "invoiceline" (
    "id" bigint NOT NULL,
    "invoiceId" bigint NOT NULL,
    "trackId" bigint NOT NULL,
    "unitPrice" float NOT NULL,
    "quantity" int NOT NULL,
    primary key ("id")
  )