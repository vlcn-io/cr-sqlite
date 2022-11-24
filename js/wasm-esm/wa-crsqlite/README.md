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

All components of `vlcn` are **Apache 2 License**. Let it be known that this one component of `vlcn` does refer to `wa-sqlite` which is `GPLv3`

Once the official SQLite WASM build is stable and performant, we'll allow users afraid of licensing amibguity to use that (via @vlcn.io/crsqlite-wasm) and remove the use of `wa-sqlite`. My current non-lawyer interpretation would be that users of this package do not need to GPL their code given the packge:

1. isn't statically linked
2. does not need to be bundled with the calling application (i.e., can be imported on the fly)
3. talks over a generic and open SQL interface under which any sqlite build could suffice
4. it would be beyond the pale to consider any work that uses a database to be a derived work of that databaseb

https://opensource.stackexchange.com/questions/2157/is-it-allowed-to-dynamically-link-a-gpl-licensed-library-for-commercial-use
https://tech.popdata.org/the-gpl-license-and-linking-still-unclear-after-30-years/
