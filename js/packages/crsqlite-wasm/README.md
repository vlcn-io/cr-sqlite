# @vlcn.io/crsqlite-wasm

WASM build of `sqlite` that can:

- run without COEP headers
- run in SharedWorkers
- run concurrently in many tabs
- run in the UI thread if desired
- includes the `crsqlite` extension.

Builds upon https://github.com/rhashimoto/wa-sqlite/. The only delta is that we add our extension at build time and expose a few extra sqlite methods.

# Examples

- [Observable Notebook](https://observablehq.com/@tantaman/cr-sqlite-basic-setup)
- [Working TODO MVC](https://github.com/vlcn-io/cr-sqlite/tree/main/js/examples/p2p-todomvc)
- [WIP Local-First Presentation Editor](https://github.com/tantaman/strut)

