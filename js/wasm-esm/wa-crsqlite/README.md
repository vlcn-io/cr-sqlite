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

All components of `vlcn` are **Apache 2 License** with the exception of this package which is GPLv3.

The components of `vlcn` do not depend on this package explicitly but rather can be combined with it or not by the end user. I.e., vlcn can run with any SQLite build -- `better-sqlite3`, `official wasm`, `sqlite3`, etc.

Once the official SQLite WASM build is stable and performant, we'll swap this build for that and relieve ourselves of any amibguity related to GPLv3. My current non-lawyer interpretation would be that users of this package do not need to GPL their code given the packge:

1. isn't statically linked
2. does not need to be bundled with the calling application (i.e., can be imported on the fly)
3. talks over a generic and open SQL interface under which any sqlite build could suffice
