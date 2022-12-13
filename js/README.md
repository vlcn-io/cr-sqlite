# crsql/js

Packages for the Node, Deno and Browser ecosystems.

- `browser` - packages for us in the browser. E.g., wasm build of SQLite and cr-sqlite.
- `node-allinone` - crsqlite bundled with sqlite3 exposed via the same API as `wasm-esm` -- allowing you to share logic between client and server
- `crsqlite` - (@vlcn.io/crsqlite) - `crsqlite` as a loadable extension that you can load into your existing sqlite package (such as better-sqlite3 or sqlite3).
- `sync-reference` - reference sync implementations. Client/server & p2p via webrtc.
- `rx` - reactive extensions for listening to table changes

To just get started quickly, rather than picking through packages, check out the `examples` directory.
