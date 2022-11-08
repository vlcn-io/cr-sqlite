import WDB, {
  Changeset,
  PokeProtocol,
  SiteIDLocal,
  SiteIDWire,
  WholeDbReplicator,
} from "@vlcn.io/replicator-wholedb";
import { DB } from "@vlcn.io/xplat-api";
import Peer, { DataConnection } from "peerjs";
// @ts-ignore
import { parse as uuidParse, stringify as uuidStringify } from "uuid";

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
  private site: Peer;
  private establishedConnections: { [key: SiteIDWire]: DataConnection } = {};
  private replicator: WholeDbReplicator;

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

  constructor(private siteId: SiteIDLocal, private db: DB) {
    this.site = new Peer(uuidStringify(siteId));
    this.site.on("connection", this._newConnection);

    this.replicator = WDB.install(db, this);
  }

  poke(poker: SiteIDWire, pokerVersion: bigint): void {
    const msg: PokeMsg = {
      tag: "poke",
      version: poker.toString(),
    };
    Object.values(this.establishedConnections).forEach((conn) => {
      conn.send(msg);
    });
  }

  pushChanges(to: SiteIDWire, changesets: readonly Changeset[]): void {
    const msg: ChangesMsg = {
      tag: "apply-changes",
      changes: changesets,
    };
    Object.values(this.establishedConnections).forEach((conn) => {
      conn.send(msg);
    });
  }

  requestChanges(from: SiteIDWire, since: bigint): void {
    const msg: RequestChangesMsg = {
      tag: "request-changes",
      since: since.toString(),
    };
    Object.values(this.establishedConnections).forEach((conn) => {
      conn.send(msg);
    });
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
    this.replicator.dispose();
    this.site.destroy();
  }

  _newConnection = (conn: DataConnection) => {
    conn.on("data", (data) => this._dataReceived(conn.peer, data as Msg));
    conn.on("close", () => delete this.establishedConnections[conn.peer]);
    conn.on("error", (e) => {
      // TODO: more reporting to the callers of us
      console.error(e);
      delete this.establishedConnections[conn.peer];
    });
    this.establishedConnections[conn.peer] = conn;
  };

  _dataReceived(from: SiteIDWire, data: Msg) {
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
}

export default function wholeDbRtc(db: DB): WholeDbRtc {
  const siteId = db.execA<[Uint8Array]>("SELECT crsql_siteid();")[0][0];
  return new WholeDbRtc(siteId, db);
}
