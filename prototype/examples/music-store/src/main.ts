import { Peer } from "peerjs";
import initDb, { Notifier } from "./createDb";
import { nanoid } from "nanoid";

// Generate our own uuid so we can initialize the db and p2p network in parallel
const siteId = nanoid();
const peer = new Peer(siteId);

peer.on("open", function (id) {
  console.log("My site ID is: " + id);
});

initDb(siteId).then(createUI);

function createUI([db, notifier]: [any, Notifier]) {
  (window as any).db = db;
}
// const stmt = db.prepare("SELECT * FROM track");
// while (stmt.step()) {
//   console.log(stmt.getAsObject());
// }
// stmt.free();
