import WDB, {
  Changeset,
  PokeProtocol,
  SiteIDLocal,
  SiteIDWire,
  WholeDbReplicator,
} from "./WholeDbReplicator.js";
import { DB, DBAsync } from "@vlcn.io/xplat-api";
import Peer, { DataConnection } from "peerjs";
// @ts-ignore
import { stringify as uuidStringify } from "uuid";

type Msg = PokeMsg | ChangesMsg | RequestChangesMsg;
/**
 * TODO: we can improve the poke msg to facilitate daisy chaning of updates among peers.
 * If the poke is the result of a sync it should include:
 * - poker id (if we are proxying)
 * - max version for that id
 */
type PokeMsg = {
  tag: "poke";
  version: string | number;
};
type ChangesMsg = {
  tag: "apply-changes";
  // TODO: metadata on min/max versions could be useful
  changes: readonly Changeset[];
};
type RequestChangesMsg = {
  tag: "request-changes";
  since: string | number;
};

export class WholeDbRtc implements PokeProtocol {
  private readonly site: Peer;
  private establishedConnections: Map<SiteIDWire, DataConnection> = new Map();
  private pendingConnections: Map<SiteIDWire, DataConnection> = new Map();
  private replicator?: WholeDbReplicator;

  public onConnectionsChanged:
    | ((
        pending: Map<SiteIDWire, DataConnection>,
        established: Map<SiteIDWire, DataConnection>
      ) => void)
    | null = null;

  private _onPoked:
    | ((pokedBy: SiteIDWire, pokerVersion: bigint) => void)
    | null = null;
  private _onNewConnection: ((siteID: SiteIDWire) => void) | null = null;
  private _onChangesRequested:
    | ((from: SiteIDWire, since: bigint) => void)
    | null = null;
  private _onChangesReceived:
    | ((fromSiteId: SiteIDWire, changesets: readonly Changeset[]) => void)
    | null = null;

  constructor(
    public readonly siteId: SiteIDLocal,
    private db: DBAsync,
    peerServer?: PeerOptions
  ) {
    this.site = new Peer(uuidStringify(siteId), peerServer);
    this.site.on("connection", (c) => {
      c.on("open", () => this._newConnection(c));
    });
  }

  async _init() {
    this.replicator = await WDB.install(this.siteId, this.db, this);
  }

  schemaChanged() {
    this.replicator!.schemaChanged();
  }

  connectTo(other: SiteIDWire) {
    if (this.pendingConnections.has(other)) {
      const c = this.pendingConnections.get(other);
      c?.close();
    }

    const conn = this.site.connect(other);
    this.pendingConnections.set(other, conn);
    this._connectionsChanged();
    conn.on("open", () => {
      this._newConnection(conn);
    });
  }

  poke(poker: SiteIDWire, pokerVersion: bigint): void {
    const msg: PokeMsg = {
      tag: "poke",
      version: pokerVersion.toString(),
    };
    this.establishedConnections.forEach((conn) => {
      conn.send(msg);
    });
  }

  pushChanges(to: SiteIDWire, changesets: readonly Changeset[]): void {
    const msg: ChangesMsg = {
      tag: "apply-changes",
      changes: changesets,
    };
    const conn = this.establishedConnections.get(to);
    if (conn) {
      conn.send(msg);
    }
  }

  requestChanges(from: SiteIDWire, since: bigint): void {
    const msg: RequestChangesMsg = {
      tag: "request-changes",
      since: since.toString(),
    };
    const conn = this.establishedConnections.get(from);
    if (conn) {
      conn.send(msg);
    }
  }

  onPoked(cb: (pokedBy: SiteIDWire, pokerVersion: bigint) => void): void {
    this._onPoked = cb;
  }

  onNewConnection(cb: (siteID: SiteIDWire) => void): void {
    this._onNewConnection = cb;
  }

  onChangesRequested(cb: (from: SiteIDWire, since: bigint) => void): void {
    this._onChangesRequested = cb;
  }

  onChangesReceived(
    cb: (fromSiteId: SiteIDWire, changesets: readonly Changeset[]) => void
  ): void {
    this._onChangesReceived = cb;
  }

  dispose(): void {
    this.replicator!.dispose();
    this.site.destroy();
  }

  private _newConnection = (conn: DataConnection) => {
    const siteId = conn.peer;
    this.pendingConnections.delete(conn.peer);

    conn.on("data", (data) => this._dataReceived(siteId, data as Msg));
    conn.on("close", () => {
      this.establishedConnections.delete(conn.peer);
      this._connectionsChanged();
    });
    conn.on("error", (e) => {
      // TODO: more reporting to the callers of us
      console.error(e);
      this.establishedConnections.delete(conn.peer);
      this._connectionsChanged();
    });

    this.establishedConnections.set(conn.peer, conn);
    this._connectionsChanged();
    this._onNewConnection && this._onNewConnection(conn.peer);
  };

  private _dataReceived(from: SiteIDWire, data: Msg) {
    switch (data.tag) {
      case "poke":
        this._onPoked && this._onPoked(from, BigInt(data.version));
        break;
      case "apply-changes":
        this._onChangesReceived && this._onChangesReceived(from, data.changes);
        break;
      case "request-changes":
        this._onChangesRequested &&
          this._onChangesRequested(from, BigInt(data.since));
        break;
    }
  }

  private _connectionsChanged() {
    this.onConnectionsChanged &&
      this.onConnectionsChanged(
        this.pendingConnections,
        this.establishedConnections
      );
  }
}

class WholeDbRtcPublic {
  private listeners = new Set<
    (pending: SiteIDWire[], established: SiteIDWire[]) => void
  >();
  constructor(private wdbrtc: WholeDbRtc) {
    wdbrtc.onConnectionsChanged = this._connectionsChanged;
  }

  get siteId() {
    return this.wdbrtc.siteId;
  }

  connectTo(other: SiteIDWire) {
    this.wdbrtc.connectTo(other);
  }

  onConnectionsChanged(
    cb: (pending: SiteIDWire[], established: SiteIDWire[]) => void
  ) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  offConnectionsChanged(
    cb: (pending: SiteIDWire[], established: SiteIDWire[]) => void
  ) {
    this.listeners.delete(cb);
  }

  schemaChanged() {
    this.wdbrtc.schemaChanged();
  }

  private _connectionsChanged = (
    pending: Map<SiteIDWire, DataConnection>,
    established: Map<SiteIDWire, DataConnection>
  ): void => {
    // notify listeners
    for (const l of this.listeners) {
      try {
        l([...pending.keys()], [...established.keys()]);
      } catch (e) {
        console.error(e);
      }
    }
  };

  dispose(): void {
    this.wdbrtc.dispose();
  }
}

export type PeerOptions = {
  host: string;
  port: number;
  path: string;
};

export default async function wholeDbRtc(
  db: DBAsync,
  peerServer?: PeerOptions
): Promise<WholeDbRtcPublic> {
  const siteId = (
    await db.execA<[Uint8Array]>("SELECT crsql_site_id();")
  )[0][0];
  const internal = new WholeDbRtc(siteId, db, peerServer);
  await internal._init();
  return new WholeDbRtcPublic(internal);
}
