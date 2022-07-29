import Peer, { DataConnection } from "peerjs";
import { DB, Notifier } from "./createDb";
import { queries } from "@cfsql/replicator";

export default class PeerConnections {
  public readonly peers: Map<string, DataConnection> = new Map();
  public readonly pendingPeers: Set<string> = new Set();
  private peerChangeCbs: Set<() => void> = new Set();

  constructor(
    private db: DB,
    private notifier: Notifier,
    public readonly me: Peer,
    public readonly id: string
  ) {
    me.on("connection", (conn) => {
      console.log("received connection");
      this.#enableSync(conn);
    });
  }

  onPeersChange(cb: () => void) {
    this.peerChangeCbs.add(cb);
    return () => this.peerChangeCbs.delete(cb);
  }

  add(peerId: string) {
    // can't add self.
    if (peerId === this.id) {
      return;
    }
    this.pendingPeers.add(peerId);

    const conn = this.me.connect(peerId);
    console.log(conn);
    conn.on("open", () => {
      console.log("opened connection");
      this.#enableSync(conn);
    });
    conn.on("error", (e) => {
      console.log(e);
      this.pendingPeers.delete(peerId);
    });

    this.#notifyPeersChanged();
  }

  remove(peerId: string) {
    const conn = this.peers.get(peerId);
    if (conn) {
      conn.close();
    }
  }

  getUpdatesFrom(peerId: string) {
    const conn = this.peers.get(peerId);
    if (!conn) {
      throw new Error(`No connection to ${peerId}`);
    }

    // ask that peer for state. `ask-state`
  }

  // allow user to choose when to sync? May be better for demo purposes.
  #enableSync(conn: DataConnection) {
    this.peers.set(conn.peer, conn);
    this.pendingPeers.delete(conn.peer);
    this.#notifyPeersChanged();

    conn.on("data", function (data) {
      // process `ask-state` and `receive-state`
      console.log("Received", data);
    });

    // send
    conn.send("Hello!");

    conn.on("close", () => {
      // clean ourselves up
      this.peers.delete(conn.peer);
    });
  }

  #notifyPeersChanged() {
    for (const cb of this.peerChangeCbs) {
      cb();
    }
  }
}

type Message =
  | {
      type: "ask-state";
      // we currently break down the ask to individual tables
      slices: [
        {
          table: string;
          clock: { [key: string]: number };
        }
      ];
    }
  | {
      type: "provide-state";
      slices: [
        {
          table: string;
          rows: any[];
        }
      ];
    };
