import { Peer } from "peerjs";
import initDb from "./createDb";

const [db, notifier] = await initDb();
(window as any).db = db;
// const stmt = db.prepare("SELECT * FROM track");
// while (stmt.step()) {
//   console.log(stmt.getAsObject());
// }
// stmt.free();
