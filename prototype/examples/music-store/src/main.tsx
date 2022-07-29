import "../index.css";
import { Peer } from "peerjs";
import initDb, { DB, Notifier } from "./createDb";
import { nanoid } from "nanoid";
import { render } from "solid-js/web";
import App from "./App";

// Generate our own uuid so we can initialize the db and p2p network in parallel
const siteId = nanoid();
const peer = new Peer(siteId);

peer.on("open", function (id) {
  console.log("My site ID is: " + id);
});

initDb(siteId).then(createUI);

function createUI([db, notifier]: [DB, Notifier]) {
  (window as any).db = db;

  render(
    () => <App db={db} notifier={notifier} />,
    nullthrows(document.getElementById("app"))
  );
}
// const stmt = db.prepare("SELECT * FROM track");
// while (stmt.step()) {
//   console.log(stmt.getAsObject());
// }
// stmt.free();

function nullthrows<T>(x: T | null): T {
  if (x == null) {
    throw new Error("unexpected null");
  }
  return x;
}
