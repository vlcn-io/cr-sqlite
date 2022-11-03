Until docs exist, see `src/wrapper.ts` and `../examples`

```
npm i @vlcn.io/crsqlite-wasm
```

## Main thread in-memory usage:

```js
import sqliteWasm from "@vlcn.io/crsqlite-wasm";

const sqlite = await sqliteWasm();
const db = sqlite.open(":memory:");

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
```

## Worker + Persistence:

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
