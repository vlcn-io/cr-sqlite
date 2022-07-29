-- SIGNED-SOURCE: <a01fd528d769ca89abfd47721eafa5d3>
CREATE TABLE
  IF NOT EXISTS "invoice" (
    "id" bigint NOT NULL,
    "customerId" bigint NOT NULL,
    "invoiceDate" bigint NOT NULL,
    "billingAddress" text,
    "billingCity" text,
    "billingState" text,
    "billingCountry" text,
    "billingPostalCode" text,
    "total" float NOT NULL,
    primary key ("id")
  )