# @vlcn.io/wa-crsqlite

WASM build of `sqlite` that can:

- run without COEP headers
- run in SharedWorkers
- run concurrently in many tabs

and includes the `crsqlite` extension.

Forked from https://github.com/rhashimoto/wa-sqlite/

You can also use [crsqlite-wasm](https://github.com/vlcn-io/cr-sqlite/tree/main/js/browser/crsqlite-wasm) which is based on the official SQLite distribution and has a MIT compatible license.

# Examples

- [Observable Notebook](https://observablehq.com/@tantaman/cr-sqlite-basic-setup)
- [Working TODO MVC](https://github.com/vlcn-io/cr-sqlite/tree/main/js/examples/p2p-todomvc)
- [WIP Local-First Presentation Editor](https://github.com/tantaman/strut)

# Licensing

All other components of `vlcn` are **Apache 2 License**. Let it be known that this optional component of `vlcn` (you can use any of the alternative db connectors -- crsqlite-wasm, crsqlite-allinone, better-sqlite3 w/ crsqlite loaded at runtime, etc. -- or you can use this one) does require use of `wa-sqlite` which is `GPLv3` making this component `GPLv3`.

Once the official SQLite WASM build is stable and performant, we'll switch to only supporting the official WASM build and return to only having Apache 2, or more permissive, licensed packages.
