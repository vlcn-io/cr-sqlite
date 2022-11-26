# @vlcn.io/crsqlite-allinone

A package for node & deno that provides a `sqlite3` library in addition to the `crsqlite` extension. It also exposes the same interface to node/deno that is exposed to the browser via the `@vlcn.io/wa-crsqlite` package, allowing you to share abstractions between the client and server.

If you are already using a `sqlite3` package (e.g., `better-sqlite3`) you can use `@vlcn.io/crsqlite` and load it as shared a module via `.loadModule`.
