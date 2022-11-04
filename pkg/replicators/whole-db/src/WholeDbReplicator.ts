import {DB} from '@vlcn.io/crsqlite-wasm';
/**
 * 
 * Connect and stream?
 * Or poke and pull?
 * 
 * Need an rx hoook...
 * need to update it on schema change...
 * 
 * 
 * hooks on clock tables
 * https://github.com/sql-js/sql.js/issues/234
 * 
 * which can return to us changed cols.
 * 
 * can we get full on changed row data?
 * 
 * should prob `after update` on base tables (less events)
 * then, after all events are gotten, select for clock data.
 * 
 * we could use our extension for selecting changes or get them ourself.
 * 
 * -> keep our v
 * -> select * from changes where v > last_v
 *   post update(s)
 * 
 * Ensure replicator removes trigger on shutdown.
 * 
 * In summary:
 * 
 * replicator.start(db);
 * 
 * - replicator installs its fn extension
 * - replicator its triggers
 * - replicator collects updates per tick
 * - repliactor asks for changes since last it asked
 * - replicator forwards across wire to connected peers
 *  - we need to track and handle re-sends...
 * 
 * easier algo for handling re-sends:
 * - replicator installs its fn extension
 * - triggers
 * - gets updated
 * - pokes connected peers with (min_v, max_v) of cs
 * 
 * poked peers:
 * - checks poke
 * - if poke max_v < changes held from that peer, do nothing
 * - else, ask for changes since last asked
 */
type SiteID = string;

const api = {
  install(db: DB): WholeDbReplicator {
    // add fn
    // add triggers
    // 
    const ret = new WholeDbReplicator(db);
    return ret;
  }
};

class WholeDbReplicator {
  
  private connectedPeers = new Set<SiteID>;
  private pendingPeers = new Set<SiteID>;
  private crrs: string[] = [];

  constructor(private db: DB) {
    this.db = db;
    db.createFunction('crsql_wdbreplicator', this.crrChanged);

    this.installTriggers();
  }

  uninstall() {
    // remove trigger(s)
    // function extension is fine to stay, it'll get removed on connection termination
    this.crrs.forEach(crr => {
      this.db.exec(`DROP TRIGGER IF EXISTS "${crr}__crsql_wdbreplicator";`)
    });
  }

  schemaChanged() {
    // re-install triggers if this happens
  }

  addPeer(s: SiteID) {
    // start connecting and syncing with `s`
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

  private crrChanged = (context: any) => {
    if (this.connectedPeers.size == 0) {
      return;
    }

    // schedule our poke
  };
}

export default api;
