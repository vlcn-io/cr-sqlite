# @vlcn.io/wa-crsqlite

The official SQLite WASM build has some issues (https://github.com/rhashimoto/wa-sqlite/discussions/63):

1. Requires OPFS which is not yet supported in Firefox
2. Reqruies COOP/COEP which isn't horrible but is a stumbling block for usability
3. OPFS currently has coarse grained file locking which makes many tabs on the same page buggy and error-prone (https://sqlite.org/wasm/doc/trunk/persistence.md#locking-vfs)
4. Doesn't handle crashes well -- db files are left in a locked state, making next restart of the app slow and buggy
5. Uses bigint literals which causes problems for vite build targets

I've used `wa-sqlite` via indexeddb VFS for ~3-4 months in other projects and haven't had issues. As such, `crsqlite` provides a `wa-sqlite` build for better devx until the offical SQLite port overcomes its problems.
