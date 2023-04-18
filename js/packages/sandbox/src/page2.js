import wasm from "@vlcn.io/crsqlite-wasm";
import wasmUrl from "@vlcn.io/crsqlite-wasm/crsqlite.wasm?url";

async function start() {
  const sqlite = await wasm(() => wasmUrl);
  const db = await sqlite.open("tst.db");

  console.log(await db.execO(`SELECT * FROM items`));
  console.log("THIS IS NEVER REACHED!");
}

start();
