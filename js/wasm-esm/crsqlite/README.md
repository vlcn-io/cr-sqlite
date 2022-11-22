This package is deprecated.

Use `@vlcn.io/wa-crsqlite`

Why?

The official WASM build of SQLite is quite janky --

- Contortious API
- Bad file locking -- can't use the db from two different tabs or workers
- Requires COOP headers
- Can't be used in a shared worker
- Its build is currently broken on Ubuntu

Given that, `cr-sqlite` is using the `wa-sqlite` WASM build which:

- Exposes the standard SQLite C API
- Can be used in shared workers
- Can be used from many concurrent tabs
- Can be used with or without COOP/COEP headers

**When the official SQLite WASM build is stable we'll return to that.**

Not that `wa-crsqlite` is the only component of `crsqlite` that is AGPL licensed. This is the case due to `wa-sqlite` project being AGPL.

Whether or not works that call `wa-sqlite` need to be `AGPL` is a bit unknown given it is two separate processes (wa-sqlite and derived app) interacting.
