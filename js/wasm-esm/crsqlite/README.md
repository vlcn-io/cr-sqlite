This package is deprecated.

Use `@vlcn.io/wa-crsqlite`

Why?

The official WASM build of SQLite is quite janky --

- Contortious API
- Bad file locking -- can't use the db from two different tabs or workers
- Requires COOP headers
- Can't be used in a shared worker

Given that, `cr-sqlite` is using the `wa-sqlite` WASM build which:

- Exposes the standard SQLite C API
- Can be used in shared workers
- Can be used from many concurrent tabs
- Can be used with or without COOP/COEP headers
