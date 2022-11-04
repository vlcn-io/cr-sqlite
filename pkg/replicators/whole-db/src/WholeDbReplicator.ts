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

  /**
   * A peer has requested changes from us.
   */
  onChangesRequested(cb: (from: SiteID, since: string) => void): void;

  /**
   * We have received changes from a peer.
   */
  onChangesReceived(cb: (changesets: Changeset[]) => void): void;

  dispose(): void;
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
    this.network.onChangesReceived(this.changesReceived);
    this.network.onChangesRequested(this.changesRequested);
  }

  dispose() {
    // remove trigger(s)
    // function extension is fine to stay, it'll get removed on connection termination
    this.crrs.forEach(crr => {
      this.db.exec(`DROP TRIGGER IF EXISTS "${crr}__crsql_wdbreplicator";`)
    });

    this.network.dispose();
  }

  schemaChanged() {
    this.installTriggers();
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
    const ourVersionForPoker = this.db.execA("SELECT version FROM __crsql_wdbreplicator_peers WHERE site_id = ?", pokedBy)[0][0];
    
    // the poker version can be less than our version for poker if a set of
    // poke messages were queued up behind a sync.
    if (BigInt(pokerVersion) <= BigInt(ourVersionForPoker)) {
      return;
    }

    // ask the poker for changes since our version
    this.network.requestChanges(this.siteId, ourVersionForPoker);
  };

  private newConnection = (siteId: SiteID) => {
    // treat it as a crr change so we can kick off sync
    this.crrChanged(null);
  };

  // if we fail to apply, re-request
  private changesReceived = (changesets: Changeset[]) => {
    // appply
  };

  private changesRequested = (from: SiteID, since: string) => {
    // query the changes table where siteid != from and version > since
  };
}

export default api;
