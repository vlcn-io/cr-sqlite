import Peer, { DataConnection } from "peerjs";
import { DB, Notifier } from "./createDb";
import { queries, clock } from "@cfsql/replicator";

const syncedTables = [
  "playlist",
  "track",
  // "playlisttrack", <-- todo: need to support compount primary keys in delta gathering.
  "artist",
  "customer",
  "employee",
  "genre",
  "invoice",
  "album",
  "invoiceline",
  "mediatype",
];

export default class PeerConnections {
  public readonly peers: Map<string, DataConnection> = new Map();
  public readonly versions: Map<string, number> = new Map();
  public readonly pendingPeers: Set<string> = new Set();

  private peerChangeCbs: Set<() => void> = new Set();
  private versionChangeCbs: Set<() => void> = new Set();

  constructor(
    private db: DB,
    private notifier: Notifier,
    public readonly me: Peer,
    public readonly id: string
  ) {
    me.on("connection", (conn) => {
      this.#enableSync(conn);
    });

    notifier.on(() => {
      const myVersion = db.exec(`select version from crr_db_version`)[0]
        .values[0][0];
      for (const conn of this.peers.values()) {
        conn.send(
          JSON.stringify({
            type: "version-update",
            count: myVersion,
          })
        );
      }
    });
  }

  onPeersChange(cb: () => void) {
    this.peerChangeCbs.add(cb);
    return () => this.peerChangeCbs.delete(cb);
  }

  onVersionsChange(cb: () => void) {
    this.versionChangeCbs.add(cb);
    return () => this.versionChangeCbs.delete(cb);
  }

  add(peerId: string) {
    // can't add self.
    if (peerId === this.id) {
      return;
    }
    this.pendingPeers.add(peerId);

    const conn = this.me.connect(peerId);
    console.log(conn);
    if (conn == null) {
      throw new Error(`Could not open a connection to peer ${peerId}`);
    }

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

    const slices = syncedTables.map((t) => {
      const q = queries.currentClock(t)[0];
      const res = this.db.exec(q);
      return {
        table: t,
        clock: clock.collapseArray(res[0].values),
      };
    });

    conn.send(
      JSON.stringify({
        type: "ask-state",
        slices,
      })
    );
  }

  // allow user to choose when to sync? May be better for demo purposes.
  #enableSync(conn: DataConnection) {
    this.peers.set(conn.peer, conn);
    this.pendingPeers.delete(conn.peer);
    this.#notifyPeersChanged();

    conn.on("data", (data) => {
      try {
        data = JSON.parse(data as string);
      } catch (e) {
        console.error(e);
        data = {};
      }

      this.#processMessage(conn, data as Message);
    });

    conn.on("close", () => {
      // clean ourselves up
      this.peers.delete(conn.peer);
    });

    conn.send(
      JSON.stringify({
        type: "version-update",
        count: this.db.exec(`select version from crr_db_version`)[0]
          .values[0][0],
      })
    );
  }

  #notifyPeersChanged() {
    for (const cb of this.peerChangeCbs) {
      cb();
    }
  }

  #processMessage(conn: DataConnection, m: Message) {
    console.log(m);
    switch (m.type) {
      case "ask-state":
        this.#provideState(conn, m);
        break;
      case "provide-state":
        this.#receiveState(conn, m);
        break;
      case "version-update":
        this.versions.set(conn.peer, m.count);
        break;
    }
  }

  #provideState(conn: DataConnection, m: AskState) {
    // someone asked us to provide state

    const slices: ProvideState["slices"] = [];
    m.slices.forEach((slice) => {
      // TODO: handle this number/string mismatch on clock
      const q = queries.deltas(slice.table, "id", slice.clock as any);
      const res = this.db.exec(q[0], q[1])[0];
      if (res == null) {
        return null;
      }
      if (res.values == null || res.values.length == 0) {
        return null;
      }

      slices.push({
        table: slice.table,
        columns: res[0].columns,
        rows: res.values,
      });
    });

    const msg = {
      type: "provide-state",
      slices,
    };

    if (slices.length === 0) {
      console.log("No slices to send");
      return;
    }

    console.log("sending", msg);
    conn.send(msg);
  }

  #receiveState(peer: DataConnection, m: ProvideState) {
    // someone provided us with state
    m.slices.forEach((slice) => {
      const q = queries.patchArray(slice.table, slice.columns, slice.rows);
      this.db.run(q[0], q[1]);
    });
  }
}

type Message =
  | AskState
  | ProvideState
  | {
      type: "version-update";
      count: number;
    };

type AskState = {
  type: "ask-state";
  // we currently break down the ask to individual tables
  slices: {
    table: string;
    clock: { [key: string]: number };
  }[];
};

type ProvideState = {
  type: "provide-state";
  slices: {
    table: string;
    columns: string[];
    rows: any[][];
  }[];
};
