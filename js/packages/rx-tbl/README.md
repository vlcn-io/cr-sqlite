# @vlcn.io/rx-tbl

Simple "table based" reactivity.

I.e., get notified whenever a table has rows inserted/deleted/updated.

Future `rx` packages will improve this to bring ractivity to the query level. I.e., only react when the specific rows used by a query have changed.

# Usage:

```
import tblrx from "@vlcn.io/rx-tbl";

// db is a handle to the database. Implements `@vlcn.io/xplat-api`
// E.g., `@vlcn.io/crsqlite-wasm` or `@vlcn.io/crsqlite-allinone`.
const rx = tblrx(db);

const disposer = rx.on((modifiedTables: Set<string>) => {
  // do whatever you need to do
});

// when you need to release your subscription
disposer();
```
