import initWasm from "@vlcn.io/crsqlite-wasm";
import wasmUrl from "@vlcn.io/crsqlite-wasm/crsqlite.wasm?url";

const sqlite = await initWasm(() => wasmUrl);
const db = await sqlite.open(":memory:");

await db.exec("CREATE TABLE foo (a primary key, b);");

db.onUpdate(() => {
  console.log("received update callback!");
});

try {
  await db.tx(async (tx) => {
    console.log("insert 1");
    await tx.exec("INSERT INTO foo (1, 2);");
    console.log("insert 2");
    await tx.exec("INSERT INTO foo (2, 3);");
  });
} catch (e) {
  console.log("wtf");
  console.log(e);
}
