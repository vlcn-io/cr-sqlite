import OutboundStream from "./OutboundStream.js";
import {
  ApplyChangesMsg,
  ApplyChangesResponse,
  Change,
  CreateOrMigrateResponse,
  EstablishOutboundStreamMsg,
  GetChangesMsg,
  GetLastSeenMsg,
  GetLastSeenResponse,
  tags,
} from "./Types.js";
import DB from "./private/DB.js";
import util from "./util.js";

/**
 * Sync interface once you have a DB instance in-hand.
 *
 * Useful for stateful sync services that do not re-create db connections
 * on every request.
 */
export default class DBSyncService {
  readonly #applyChangesTx;
  readonly #getSinceLastApplyStmt;
  readonly #setSinceLastApplyStmt;

  constructor(private readonly db: DB) {
    this.#applyChangesTx = db.transaction(this.#applyChangesInternal);
    this.#getSinceLastApplyStmt = db.prepare(
      `SELECT version, seq FROM crsql_tracked_peers WHERE site_id = ? AND tag = 0 AND event = 0`
    );
    this.#getSinceLastApplyStmt.raw(true);
    // TODO: you should only update the tracking if the new version is later than the prior version.
    this.#setSinceLastApplyStmt = db.prepare(
      `INSERT OR REPLACE INTO crsql_tracked_peers (site_id, tag, event, version, seq) VALUES (?, 0, 0, ?, ?)`
    );
  }

  async maybeMigrate(
    schemaName: string,
    version: string
  ): Promise<CreateOrMigrateResponse> {
    const status = await this.db.migrateTo(schemaName, version);
    return {
      _tag: tags.createOrMigrateResponse,
      status,
    };
  }

  /**
   * Allows one client to ask another what version it last saw from it.
   *
   * This is usefuly in then establishing an outbound stream to send changes
   * such that it starts at the right version.
   * @param msg
   * @returns
   */
  getLastSeen(msg: GetLastSeenMsg): GetLastSeenResponse {
    const lastSeen = this.#getSinceLastApplyStmt.get(
      util.uuidToBytes(msg.fromDbid)
    ) as [bigint, number];
    return {
      _tag: tags.getLastSeenResponse,
      seq: lastSeen,
    };
  }

  /**
   * Applies changes with sanity checking to esnure contiguity of messages.
   *
   * A client that is continuously sending changes to another client
   * should ensure that the `seqStart` of their message is equal to the `seqEnd` of their prior msg.
   *
   * The `seqEnd` of the prior msg is just the largest dbversion & seq in the `changes` array.
   *
   * If a single DB opens many sync connections to the server we can end up with out of order delivery.
   *
   * A few ways to solve this:
   * 1. Require the client to manage a contiguous stream and have the server just apply.
   * 2. Have the server throw and say from which version to restart
   * 3. Have the client only create one sync connection to the server for the same client DB.
   *
   * Pt 3 would need to be done via a shared worker or leader election.
   * @param msg
   */
  applyChanges(msg: ApplyChangesMsg): ApplyChangesResponse {
    // 1. ensure contiguity of messages by checking seqStart against seen_peers
    // 2. apply changes in a transaction and update seen_peers
    // 3. return status
    try {
      this.#applyChangesTx(msg);
      return {
        _tag: tags.applyChangesResponse,
        seqEnd: msg.seqEnd,
        status: "ok",
      };
    } catch (e: any) {
      console.error(e);
      return {
        _tag: tags.applyChangesResponse,
        msg: e.msg,
        seqEnd: e.seqEnd,
        status: e.status || "uncaught",
      };
    }
  }

  getChanges(msg: GetChangesMsg): Change[] {
    return [];
  }

  startOutboundStream(msg: EstablishOutboundStreamMsg): OutboundStream {
    // Constructs an outbound stream
    // Registers it with FSListener
    // Returns it.
    // OutboundStream will fire events that the user can then
    // hook into their network.
    // Outbound streams need to be closed when the user is done with them.
    // Can use Sever Sent Events for this rather than websockets.
    throw new Error("Unimplemented");
  }

  // startInboundStream(): InboundStream {
  //   throw new Error();
  // }

  close() {
    // closes all associated outbound streams and this db.
  }

  #applyChangesInternal = (msg: ApplyChangesMsg) => {
    const fromDbidAsBytes = util.uuidToBytes(msg.fromDbid);
    const [version, seq] = this.#getSinceLastApplyStmt.get(fromDbidAsBytes) as [
      bigint,
      number
    ];

    // if their supplied version is <= the version we already have then we can process the msg.
    if (msg.seqStart[0] > version) {
      throw {
        msg: `Cannot apply changes from ${msg.seqStart[0]} when last seen version was ${version}`,
        seqEnd: [version, seq],
        status: "outOfOrder",
      };
    }

    if (msg.seqStart[1] > seq) {
      throw {
        msg: `Cannot apply changes from ${msg.seqStart[0]} when last seen seq was ${seq}`,
        seqEnd: [version, seq],
        status: "outOfOrder",
      };
    }

    const [newVersion, newSeq] = this.db.applyChanges(
      fromDbidAsBytes,
      msg.changes
    );

    this.#setSinceLastApplyStmt.run(fromDbidAsBytes, newVersion, newSeq);
  };
}
