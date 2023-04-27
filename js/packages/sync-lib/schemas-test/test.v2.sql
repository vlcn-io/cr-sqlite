CREATE TABLE IF NOT EXISTS foo (
  a primary key,
  b,
  c
);

SELECT crsql_as_crr('foo');