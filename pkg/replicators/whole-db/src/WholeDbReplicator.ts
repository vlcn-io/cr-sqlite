import {DB} from '@vlcn.io/crsqlite-wasm';
type SiteID = string;
type CID = string;
type QuoteConcatedPKs = string;
type TableName = string;
type Version = string;
type TODO = any;

/**
 * The `poke` protocol is the simplest option in terms of 
 * - causal delivery of messages
 * - retry on drop
 */
interface PokeProtocol {
  /**
   * Tell all connected sites that we have updates from this site
   * ending at `pokerVersion`
   */
  poke(poker: SiteID, pokerVersion: string): void;

  /**
   * Push changes to the given site in response to their request for changes.
   */
  pushChanges(to: SiteID, changesets: Changeset[]): void;

  /**
   * Request changes from a given site since a given version
   * in response to a poke from that site.
   */
  requestChanges(from: SiteID, since: string): void;

  /**
   * Receive a poke froma given site.
   * In response, we'll compute what changes we're missing from that site
   * and request those changes.
   */
  onPoked(cb: (pokedBy: SiteID, pokerVersion: string) => void): void;

  /**
   * When someone new connects we can just poke them to kick off
   * initial sync. Simple.
   */
  onNewConnection(cb: (siteID: string) => void): void;

  onChangesRequested(cb: (from: SiteID, since: string) => void): void;

  // changesets encode the `from` site id since peers can be proxying changes for
  // other peers.
  onChangesReceived(cb: (changesets: Changeset[]) => void): void;
};

type Changeset = [
  TableName,
  QuoteConcatedPKs,
  CID,
  any, // val,
  Version,
  SiteID, // site_id
];

const api = {
  install(db: DB, network: PokeProtocol): WholeDbReplicator {
    const ret = new WholeDbReplicator(db, network);
    return ret;
  }
};

// TODO: we need to handle initial sync.
// Well, that should be easy. Just poke people on connect.

class WholeDbReplicator {
  private crrs: string[] = [];
  private pendingNotification = false;
  private siteId: SiteID;

  constructor(private db: DB, private network: PokeProtocol) {
    this.db = db;
    db.createFunction('crsql_wdbreplicator', this.crrChanged);

    this.siteId = db.execA("SELECT crsql_siteid()")[0][0];
    this.installTriggers();
    this.createPeerTrackingTable();

    this.network.onPoked(this.poked);
    this.network.onNewConnection(this.newConnection);
  }

  dispose() {
    // remove trigger(s)
    // function extension is fine to stay, it'll get removed on connection termination
    this.crrs.forEach(crr => {
      this.db.exec(`DROP TRIGGER IF EXISTS "${crr}__crsql_wdbreplicator";`)
    });

    // TODO: dispose poke network or remove self from
  }

  schemaChanged() {
    // re-install triggers if this happens
  }

  private installTriggers() {
    // find all crr tables
    const crrs = this.db.execA("SELECT name FROM sqlite_master WHERE name LIKE '%__crsql_clock'");
    crrs.forEach(crr => {
      this.db.exec(
        `CREATE TRIGGER "${crr}__crsql_wdbreplicator" AFTER UPDATE ON "${crr}"
        BEGIN
          select crsql_wdbreplicator();
        END;
      `)
    });
    this.crrs = crrs;
  }

  private createPeerTrackingTable() {
    this.db.exec("CREATE TABLE IF NOT EXISTS __crsql_wdbreplicator_peers (site_id primary key, version)");
  }

  private crrChanged = (context: TODO) => {
    if (this.pendingNotification) {
      return;
    }

    this.pendingNotification = true;
    queueMicrotask(() => {
      this.pendingNotification = false;
      const dbv = this.db.execA("SELECT crsql_dbversion()")[0][0];
      this.network.poke(this.siteId, dbv);
    });
  };

  private poked = (pokedBy: SiteID, pokerVersion: string) => {
    // see when we last asked that site for their changes.
    // ask for changes.
    // TODO: prep statement and bind.
    // this.db.execA("SELECT version FROM __crsql_wdbreplicator_peers WHERE site_id = ")
    const ourVersionForPoker = 0n;
    if (BigInt(pokerVersion) <= ourVersionForPoker) {
      return;
    }

    // ask the poker for changes since our version
    this.network.requestChanges(this.siteId, ourVersionForPoker.toString());
  };

  private newConnection = (siteId: SiteID) => {
    // treat it as a crr change so we can kick off sync
    this.crrChanged(null);
  };
}

export default api;
