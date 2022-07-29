import "../index.css";
import { Peer } from "peerjs";
import initDb, { DB, Notifier } from "./createDb";
import { nanoid } from "nanoid";
import { render } from "solid-js/web";
import App from "./App";
import PeerConnections from "./PeerConnections";

// Generate our own uuid so we can initialize the db and p2p network in parallel
const siteId = sessionStorage.getItem("siteId") || nanoid();
sessionStorage.setItem("siteId", siteId);
const me = new Peer(siteId);

initDb(siteId).then(createUI);

function createUI([db, notifier]: [DB, Notifier]) {
  (window as any).db = db;

  const connections = new PeerConnections(db, notifier, me);
  render(
    () => <App db={db} notifier={notifier} connections={connections} />,
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
