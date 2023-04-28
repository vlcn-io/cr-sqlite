CREATE TABLE schema (
  namespace TEXT NOT NULL,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  schema TEXT NOT NULL,
  PRIMARY KEY (namespace, name, version)
);
