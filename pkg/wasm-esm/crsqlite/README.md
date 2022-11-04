Until docs exist, see `src/wrapper.ts` and `../examples`

# Install

```
npm i @vlcn.io/crsqlite-wasm
```

# Example Usage

## Create a DB in the main thread

```js
import sqliteWasm from "@vlcn.io/crsqlite-wasm";
import { Uuid } from "uuid-tool";

const sqlite = await sqliteWasm();

const db = sqlite.open(":memory:");
let rows = [];

db.exec("CREATE TABLE foo (a primary key, b);");
db.exec("SELECT crsql_as_crr('foo');");
db.exec("INSERT INTO foo VALUES (1, 2);");
rows = db.execA("select crsql_dbversion();");
console.log("DB Version: ", rows[0][0]);
rows = db.execA("select crsql_siteid();");
console.log("Site ID: ", new Uuid(rows[0][0]).toString());

rows = db.execA("select * from crsql_changes();");
console.log("Changes: ", rows);

rows = db.execA("SELECT * FROM foo");
console.log(rows[0]);

db.close();
```

## Creating a DB in a worker, query it from the main thread

See `examples/src/comlink.ts`

```js
import * as Comlink from "comlink";
// @ts-ignore -- todo
import DBWorker from '@vlcn.io/crsqlite-wasm/dist/comlinked?worker';
import {API} from '@vlcn.io/crsqlite-wasm/dist/comlinked';

const db = Comlink.wrap(new DBWorker()) as API;

async function onReady() {
  console.log('ready');

  await db.open(/* optional file name */);

  await db.exec([
    "CREATE TABLE foo (a, b);",
    "INSERT INTO foo VALUES (1, 2), (3, 4);"
  ]);

  const rows = await db.execO("SELECT * FROM foo");
  console.log(rows);
}

function onError(e: any) {
  console.error(e);
}

db.onReady(Comlink.proxy(onReady), Comlink.proxy(onError));
```

## Bare Worker + Persistence:

main.js:
```js
new Worker(new URL("./worker.js", import.meta.url), {
  type: "module",
});
```

worker.js
```js
import sqliteWasm from "@vlcn.io/crsqlite-wasm";

sqliteWasm().then((sqlite3) => {
  const db = sqlite3.open("example-db", "c");

  db.exec([
    "CREATE TABLE IF NOT EXISTS baz (a, b);",
    "INSERT INTO baz VALUES (1, 2);",
  ]);

  const rows = db.execA("SELECT * FROM baz");
  console.log(rows);

  db.close();
});
```
