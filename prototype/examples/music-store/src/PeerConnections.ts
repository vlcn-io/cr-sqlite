import Peer from "peerjs";
import { DB, Notifier } from "./createDb";

/**
 * First pass: just have peers poll one another on an interval? 😬
 * Later pass: stream all updates from peer to connected peer.
 *   Peer needs to ensure causal reception
 * Later later pass: allow collapsing of events when events overwrite previous events
 *
 * List out connected peers and the clocks from them.
 */
export default class PeerConnections {
  constructor(
    private db: DB,
    private notifier: Notifier,
    public readonly me: Peer
  ) {
    me.on("open", function (id) {
      console.log("My site ID is: " + id);
    });
  }

  add() {}

  remove() {}

  goOffline() {}
}
