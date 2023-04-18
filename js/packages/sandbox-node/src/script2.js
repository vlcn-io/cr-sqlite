import SQLiteDB from "better-sqlite3";

// the crsqlite package exports the path to the extension
import { extensionPath } from "@vlcn.io/crsqlite";

const db = new SQLiteDB("tst.db");
// suggested settings for best performance of sqlite
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
// load that extension with the `better-sqlite3` bindings
db.loadExtension(extensionPath);

console.log(db.prepare("SELECT * FROM items").all());
console.log("THIS IS NEVER REACHED!");
