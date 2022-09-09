# cfsqlite - sidecar

As a non-intrusive option (keep your application's existing sqlite bindings and sqlite build), `cfsqlite` can be used as a "side-car" to your standard sqlite integration.

Thisis the case since the only queries that require special treatment to make `sqlite` conflict-free are those that alter the schema(s) of tables. `select`, `insert`, and `update` queries are unchanged.

The `sidecar` provides methods to re-write any of your schema changing queries to their conflict-free schema creation & alteration equivalents. If you pass `sidecar` a non-crr query `sidecar` will just return it back to you unchanged. This latter option is provided as a convenience so you can pass all queries through sidecar without having to know their contents.

TODO: site_id and db_seq extensions must be loaded on the given connection.
TODO: share db_seq num across connections?

## Example Usage

The `SQL` syntax is extended by sidecar to add the following statements:

```sql
CREATE CRR TABLE ...
CREATE CRR INDEX ...
ALTER CRR TABLE ...
DROP CRR TABLE ...
DROP CRR INDEX ...
```

Other than the addition of `CRR` (where CRR stands for conflict free replicated relation), the syntax of these statements is identical to their non-crr equivalents.

When you want to create a conflict free table or modify a conflict free table, craft a `CRR` query and provide it to `sidecar`.

`sidecar` will re-write the given query into a series of standard `SQL` statements that you then execute in a transaction against your `sqlite` db.

Example usage:

```js
// do everything in a transaction so we don't end up in an inconsistent state
sqlite_connection.in_transaction(() => {
  // re-write our query to standard sql
  let [query, meta_query] = sidecar.rewrite(query);
  // run the re-written query
  sqlite_connection.execute(query);
  // if a meta query was returned, do additional crr work
  if (meta_query) {
    metadata = sqlite_connection.all(query);
    sqlite_connection.execute(sidecar.support_statements(metadata));
  }
});
```
