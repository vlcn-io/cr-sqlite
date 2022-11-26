# @vlcn.io/wa-crsqlite

WASM build of `sqlite` that can:

- run without COEP headers
- run in SharedWorkers
- run concurrently in many tabs

and includes the `crsqlite` extension.

Forked from https://github.com/rhashimoto/wa-sqlite/

To be used until the official SQLite build is up to the task.

# Examples

- [Observable Notebook](https://observablehq.com/@tantaman/cr-sqlite-basic-setup)
- [Working TODO MVC](https://github.com/vlcn-io/cr-sqlite/tree/main/js/examples/p2p-todomvc)
- [WIP Local-First Presentation Editor](https://github.com/tantaman/strut)

# Licensing

All components of `vlcn` are **Apache 2 License**. Let it be known that this optional component of `vlcn` does refer to `wa-sqlite` which is `GPLv3`

Once the official SQLite WASM build is stable and performant, we'll allow users afraid of licensing amibguity to use that (via @vlcn.io/crsqlite-wasm) and remove the use of `wa-sqlite`.
