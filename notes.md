# pk-lookup

- New table

```sql
CREATE TABLE foo__crsql_pks (num INTEGER PRIMARY KEY, ...pks);
CREATE UNIQUE INDEX ON foo__crsql_pks (...pks);
```

Merges... We still send actual PKs over the wire. Each host has its own nums.

Merge:

1. Lookup num
   -- num missing means we have no record can do some short-circuits here
2. Do clock table stuff with num

Pull changes:

1. Join pks via num
