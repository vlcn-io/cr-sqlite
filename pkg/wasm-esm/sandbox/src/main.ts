// import sqliteWasm from "@vlcn.io/crsqlite-wasm";

// const sqlite = await sqliteWasm();
// const db = sqlite.open(":memory:");

// // @ts-ignore
// window.db = db;

// window.onbeforeunload = () => {
//   db.close();
// };

import sqliteWasm from "@vlcn.io/wa-crsqlite";

const sqlite = await sqliteWasm();

console.log(sqlite);

const db = await sqlite.open("foo.db");
sqlite.base.exec(db.db, "SELECT crsql_siteid()", (r) => {
  console.log(r);
});

(window as any).sqlite = sqlite;
