# crsql/js

Packages for the Node, Deno and Browser ecosystems.

- `wasm-esm` - WASM build of SQLite + CR-SQLite statically linked
- `nodeno` - packages of CR-SQLite for node & deno
  - `allinone` - crsqlite bundled with sqlite3 exposed via the same API as `wasm-esm` -- allowing you to share logic between client and server
  - `crsqlite` - (@vlcn/crsqlite) - `crsqlite` as a loadable extension that you can load into your existing sqlite package.
- `replicators` - replication protocols
- `rx` - reactive extensions for listening to table changes
- `network` - transports

To just get started quickly, rather than picking through packages, check out the `pkg/examples` directory.
