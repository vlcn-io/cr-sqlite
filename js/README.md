# crsqlite-js

JavaScript packages to use `cr-sqlite` in the browser, node, react and other JS frameworks & environments.

# Quickstart

Scaffolding a new project -- https://github.com/vlcn-io/vite-starter/tree/main

Example apps:

- https://github.com/vlcn-io/live-examples
- [Observable Notebook](https://observablehq.com/@tantaman/cr-sqlite-basic-setup)
- [WIP Local-First Presentation Editor](https://github.com/tantaman/strut)

## Browser

```ts
import initWasm from "@vlcn.io/crsqlite-wasm";
import wasmUrl from "@vlcn.io/crsqlite-wasm/crsqlite.wasm?url";

const crsqlite = await initWasm(wasmUrl);
const db = await sqlite.open("db-name");

...

db.close();
```

## NodeJS

```ts
import Database from "better-sqlite3";

const db = new Database(":memory:");
import { extensionPath } from "@vlcn.io/crsqlite";
db.loadExtension(extensionPath);

...

db.close();
```

## React

```ts
function TodoList() {
  const allTodos: readonly Todo[] = useQuery<Todo>(
    ctx,
    "SELECT * FROM todo ORDER BY id DESC"
  ).data;

  return (
    <div>
      {allTodos.map((t) => (
        <Todo item={t} />
      ))}
    </div>
  );
}
```

## Sync

```ts
import tblrx from "@vlcn.io/rx-tbl";
import startSync from "@vlcn.io/client-websocket";

const rx = tblrx(db);
const sync = await startSync(`ws://${window.location.hostname}:8080/sync`, {
  localDb: db,
  remoteDbId: dbid,
  create: {
    schemaName: "todo-mvc",
  },
  rx,
});
```

# Packages

## Storage

- [crsqlite](https://github.com/vlcn-io/cr-sqlite): The cr-sqlite loadable extension for use in NodeJS/Deno/Bun. Can be used with the SQLite bindings you currently use.
- [crsqlite-wasm](./packages/crsqlite-wasm): WASM build of CR-SQLite & SQLite for use in the browser.

## Sync

- [client-websocket](./packages/client-websocket): Websocket client to sync the browser's database to a database hosted on a websocket server.
- [server-websocket](./packages/server-websocket): Websocket server implementation.
- p2p: A peer to peer networking implementation, based on webrtc

## UI

- [react](./packages/react): React hooks for driving UI state from database queries

## Other

- [xplat-api](./packages/xplat-api): interfaces for components that can exist in NodeJS or the Browser.
- [client-core](./packages/client-core): Networking code that is common across all client implementations
- [client-server-common](./packages/client-server-common): Networking code that is common to the client and server
- [server-core](./packages/server-core): Network code that is common across all server implementations
- [node-allinone](./packages/node-allinone): convenience package for loading and using crsqlite in nodejs
  - Can also be used as a run time loadable extension in `nodejs` with whatever `sqlite` bindings you already use. See the `node-allinone` readme for more details
- [tsbuild-all](./tsbuild-all): convenient package for building all other packages

## Integration Tests

- node-tests:
- xplat-tests:
- browser-tests:

# Contributing

If you want to build these projects from source and/or hack on them or contribute, you'll need to clone the workspace repository:

```bash
git clone --recurse-submodules git@github.com:vlcn-io/workspace.git
```

Running `make` in that directory will get you set up. Ensure you have the rust nightly toolchain installed and activated before running make.
