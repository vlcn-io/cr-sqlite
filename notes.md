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

# Trigger opt

- function to `insert and save` a lookaside in `insert_trigger`
- function to `get and save` a lookaside in `update_trigger`
  - replace these lookups: `(SELECT __crsql_key FROM \"{table_name}__crsql_pks\" WHERE {pk_where_list})`
- 

- Test changing pks in update creates key lookaside correctly.

---

Assuming we re-write to use a function...

```ts
function after_update(table, cols_new, cols_old) {
  // cols_new and cols_old are _in order_ as according to table_info

  // 1. Lookup the old record with `cols_old`
  // 2. Do the pk delete stuff if there exists a record with old
  // 3. If any pk is different, record a create record (sqlite value compare)
  // 4. For each non_pk, record the clock metadata
}
```
