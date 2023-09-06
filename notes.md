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

# next db version optimization

We currently nuke this on commit.

We can keep a variable in ext data to represent it and only nuke / refresh it if the data change bit is set.

The variable needs to be set on merge

```ts
crsql_next_db_version(arg?)

// arg is optional. If present, we set the `pending next db version`
function crsql_next_db_version(arg?) {
  const ret = max(crsql_db_version() + 1, pExtData.pendingDbVersion, arg);
  pExtData.pendingDbVersion = ret;
  return ret;
}
```

On commit, pending becomes actual.
