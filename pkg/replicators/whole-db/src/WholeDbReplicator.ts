import { DB } from "@vlcn.io/xplat-api";
import { parse as uuidParse, stringify as uuidStringify } from "uuid";
export type SiteIDWire = string;
export type SiteIDLocal = Uint8Array;
type CID = number;
type QuoteConcatedPKs = string | number;
type TableName = string;
type Version = number | string;
type TODO = any;

const DOES_EXTENSION_EXIST =
  "SELECT 1 FROM pragma_function_list WHERE name = 'crsql_wdbreplicator'";

/**
 * The `poke` protocol is the simplest option in terms of
 * - causal delivery of messages
 * - retry on drop
 */
export interface PokeProtocol {
  /**
   * Tell all connected sites that we have updates from this site
   * ending at `pokerVersion`
   */
  poke(poker: SiteIDWire, pokerVersion: bigint): void;

  /**
   * Push changes to the given site in response to their request for changes.
   */
  pushChanges(to: SiteIDWire, changesets: readonly Changeset[]): void;

  /**
   * Request changes from a given site since a given version
   * in response to a poke from that site.
   */
  requestChanges(from: SiteIDWire, since: bigint): void;

  /**
   * Receive a poke froma given site.
   * In response, we'll compute what changes we're missing from that site
   * and request those changes.
   */
  onPoked(cb: (pokedBy: SiteIDWire, pokerVersion: bigint) => void): void;

  /**
   * When someone new connects we can just poke them to kick off
   * initial sync. Simple.
   */
  onNewConnection(cb: (siteID: SiteIDWire) => void): void;

  /**
   * A peer has requested changes from us.
   */
  onChangesRequested(cb: (from: SiteIDWire, since: bigint) => void): void;

  /**
   * We have received changes from a peer.
   */
  onChangesReceived(
    cb: (fromSiteId: SiteIDWire, changesets: readonly Changeset[]) => void
  ): void;

  dispose(): void;
}

export type Changeset = [
  TableName,
  QuoteConcatedPKs,
  CID,
  any, // val,
  Version,
  SiteIDWire // site_id
];

const api = {
  install(db: DB, network: PokeProtocol): WholeDbReplicator {
    const ret = new WholeDbReplicator(db, network);
    return ret;
  },
};

// TODO: we need to handle initial sync.
// Well, that should be easy. Just poke people on connect.

export class WholeDbReplicator {
  private crrs: string[] = [];
  private pendingNotification = false;
  private siteId: SiteIDLocal;
  private siteIdWire: SiteIDWire;

  constructor(private db: DB, private network: PokeProtocol) {
    this.db = db;
    db.createFunction("crsql_wdbreplicator", () => this.crrChanged());

    this.siteId = db.execA<[Uint8Array]>("SELECT crsql_siteid()")[0][0];
    this.siteIdWire = uuidStringify(this.siteId);
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
    this.crrs.forEach((crr) => {
      ["INSERT", "UPDATE", "DELETE"].forEach((verb) =>
        this.db.exec(
          `DROP TRIGGER IF EXISTS "${crr}__crsql_wdbreplicator_${verb.toLowerCase()}";`
        )
      );
    });

    this.network.dispose();
  }

  schemaChanged() {
    this.installTriggers();
  }

  private installTriggers() {
    // find all crr tables
    // TODO: ensure we are not notified
    // if we're in the process of applying sync changes.
    // TODO: we can also just track that internally.
    // well we do want to pass on to sites that are not the site
    // that just send the patch.
    const crrs: string[][] = this.db.execA(
      "SELECT name FROM sqlite_master WHERE name LIKE '%__crsql_clock'"
    );

    const baseTableNames = crrs.map((crr) => {
      const fullTblName = crr[0];
      const baseTblName = fullTblName.substring(
        0,
        fullTblName.lastIndexOf("__crsql_clock")
      );
      ["INSERT", "UPDATE", "DELETE"].map((verb) => {
        this.db.exec(
          `CREATE TRIGGER IF NOT EXISTS "${baseTblName}__crsql_wdbreplicator_${verb.toLowerCase()}" AFTER ${verb} ON "${baseTblName}"
          BEGIN
            select crsql_wdbreplicator() WHERE crsql_internal_sync_bit() = 0 AND EXISTS (${DOES_EXTENSION_EXIST});
          END;
        `
        );
      });

      return baseTblName;
    });
    this.crrs = baseTableNames;
  }

  private createPeerTrackingTable() {
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS __crsql_wdbreplicator_peers (site_id primary key, version)"
    );
  }

  private crrChanged() {
    if (this.pendingNotification) {
      return;
    }

    this.pendingNotification = true;
    queueMicrotask(() => {
      this.pendingNotification = false;
      const dbv = this.db.execA<[number | bigint]>(
        "SELECT crsql_dbversion()"
      )[0][0];
      this.network.poke(this.siteIdWire, BigInt(dbv));
    });
  }

  private poked = (pokedBy: SiteIDWire, pokerVersion: bigint) => {
    const rows = this.db.execA(
      "SELECT version FROM __crsql_wdbreplicator_peers WHERE site_id = ?",
      [uuidParse(pokedBy)]
    );
    let ourVersionForPoker: bigint = 0n;
    if (rows != null && rows.length > 0) {
      // ensure it is a bigint. sqlite will return number if in js int range and bigint if out of range.
      ourVersionForPoker = BigInt(rows[0][0]);
    }

    // the poker version can be less than our version for poker if a set of
    // poke messages were queued up behind a sync.
    if (pokerVersion <= ourVersionForPoker) {
      return;
    }

    // ask the poker for changes since our version
    this.network.requestChanges(this.siteIdWire, ourVersionForPoker);
  };

  private newConnection = (siteId: SiteIDWire) => {
    // treat it as a crr change so we can kick off sync
    this.crrChanged();
  };

  // if we fail to apply, re-request
  // TODO: other retry mechanisms
  // todo: need to know who received from. cs site id can be a forwarded site id
  private changesReceived = (
    fromSiteId: SiteIDWire,
    changesets: readonly Changeset[]
  ) => {
    this.db.transaction(() => {
      let maxVersion = 0n;
      const stmt = this.db.prepare(
        'INSERT INTO crsql_changes ("table", "pk", "cid", "val", "version", "site_id") VALUES (?, ?, ?, ?, ?, ?)'
      );
      // TODO: may want to chunk
      try {
        // TODO: should we discard the changes altogether if they're less than the tracking version
        // we have for this peer?
        // that'd preclude resetting tho.
        changesets.forEach((cs) => {
          const v = BigInt(cs[4]);
          maxVersion = v > maxVersion ? v : maxVersion;
          stmt.run(cs[0], cs[1], cs[2], cs[3], cs[4], uuidParse(cs[5]));
        });
      } finally {
        stmt.finalize();
      }

      this.db.exec(
        `INSERT OR REPLACE INTO __crsql_wdbreplicator_peers (site_id, version) VALUES (?, ?)`,
        [uuidParse(fromSiteId), maxVersion]
      );
    });
  };

  private changesRequested = (from: SiteIDWire, since: bigint) => {
    const fromAsBlob = uuidParse(from);
    const changes: Changeset[] = this.db.execA<Changeset>(
      "SELECT * FROM crsql_changes WHERE site_id != ? AND version > ?",
      [fromAsBlob, since]
    );

    if (changes.length == 0) {
      return;
    }
    this.network.pushChanges(from, changes);
  };
}

export default api;
