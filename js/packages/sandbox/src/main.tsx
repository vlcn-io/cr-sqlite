import initWasm from "@vlcn.io/crsqlite-wasm";
import wasmUrl from "@vlcn.io/crsqlite-wasm/crsqlite.wasm?url";

const sqlite = await initWasm(() => wasmUrl);
const db = await sqlite.open(":memory:");

try {
  await db.exec("CREATE TABLE foo;");
} catch (e) {
  console.log("wooo");
}
