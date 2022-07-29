import initSqlJs from "sql.js";

const sqlPromise = initSqlJs({
  locateFile: (file) => `/${file}`,
});
const dataPromise = fetch("/chinook-crr.db").then((res) => res.arrayBuffer());
const [SQL, buf] = await Promise.all([sqlPromise, dataPromise]);
const db = new SQL.Database(new Uint8Array(buf));

const stmt = db.prepare("SELECT * FROM track");
while (stmt.step()) {
  console.log(stmt.getAsObject());
}
stmt.free();
