import sqliteWasm from "@vlcn.io/crsqlite-wasm";

const sqlite = await sqliteWasm();
const db = sqlite.open(":memory:");

// @ts-ignore
window.db = db;

window.onbeforeunload = () => {
  db.close();
};

// import sqliteWasm from "@vlcn.io/wa-crsqlite";

// const sqlite = await sqliteWasm();
