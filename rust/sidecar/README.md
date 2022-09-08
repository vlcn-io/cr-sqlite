# cfsql - sidecar

The original plan was to provide a wrapper around the sqlite connection. The user would issue all queries over the wrapped connection.

Fully wrapping the connection and exposing new bindings for each target language (js, rust, java, swift, etc.) is a bit cost prohibitive.

Secondly, in reality, the only statements that need re-writing are:

- create table
- alter table
- create index

Enter "sidecar"

## Sidecar

Sidecar is a library to which you pass:

1. A connection
2. Statements to create or alter conflict-free tables

and sidecar will create or update the schemas for the given conflict-free table(s).

All other queries are issued over the standard connection.

For convenience, users of sidecar can pass non-crr queries and they'll be executed as normal.

## Unification

If users want a single interface (rather than chosing sidecar vs connection), they can abstract over sidecar in user space.

E.g.,

```
class UnifiedConnection {
  constructor(private connection, private sidecar) {}

  execute(query) {
    return sidecar.execute(this.connection, query);
  }

  prepare(query) {
    return this.connection.prepare(query);
  }
}
```
