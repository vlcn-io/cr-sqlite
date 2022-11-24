This package is deprecated until the official SQLite WASM build is more stable. Once that happens, this package will be reusrrected.

Use `@vlcn.io/wa-crsqlite` until then.

Why?

The official WASM build of SQLite is still a bit rough around the edges --

- Difficult API
- Coarse grained file locking -- can't use the db from two different tabs or workers
- Requires COOP headers
- Can't be used in a shared worker
- It's build is currently broken on Ubuntu

Given that, `cr-sqlite` is using the `wa-sqlite` WASM build which:

- Exposes the standard SQLite API without much additional fluff
- Can be used in shared workers
- Can be used from many concurrent tabs
- Can be used with or without COOP/COEP headers

**When the official SQLite WASM build is stable we'll return to that.**

