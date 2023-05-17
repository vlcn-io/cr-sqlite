import OutboundStream from "./private/OutboundStream.js";
import {
  ApplyChangesMsg,
  ApplyChangesResponse,
  Change,
  CreateOrMigrateResponse,
  EstablishOutboundStreamMsg,
  GetChangesMsg,
  GetChangesResponse,
  GetLastSeenMsg,
  GetLastSeenResponse,
  Seq,
  tags,
} from "@vlcn.io/direct-connect-common";
import DB from "./private/DB.js";

/**
 * Sync interface once you have a DB instance in-hand.
 *
 * Useful for stateful sync services that do not re-create db connections
 * on every request.
 */
const DBSyncService = {
  maybeMigrate(
    db: DB,
    schemaName: string,
    version: bigint,
    requestorDbid: Uint8Array
  ): CreateOrMigrateResponse {
    const status = db.migrateTo(schemaName, version);
    const lastSeen = db.getSinceLastApplyStmt.get(requestorDbid) as
      | [bigint, number]
      | undefined;
    return {
      _tag: tags.createOrMigrateResponse,
      seq: lastSeen || [0n, 0],
      status,
    };
  },

  /**
   * Allows one client to ask another what version it last saw from it.
   *
   * This is usefuly in then establishing an outbound stream to send changes
   * such that it starts at the right version.
   * @param msg
   * @returns
   */
  getLastSeen(db: DB, msg: GetLastSeenMsg): GetLastSeenResponse {
    const lastSeen = db.getSinceLastApplyStmt.get(msg.fromDbid) as
      | [bigint, number]
      | undefined;
    return {
      _tag: tags.getLastSeenResponse,
      seq: lastSeen || [0n, 0],
    };
  },

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
  applyChanges(db: DB, msg: ApplyChangesMsg): ApplyChangesResponse {
    // 1. ensure contiguity of messages by checking seqStart against seen_peers
    // 2. apply changes in a transaction and update seen_peers
    // 3. return status
    db.transaction(applyChangesInternal)(db, msg);
    return {
      _tag: tags.applyChangesResponse,
    };
  },

  getChanges(db: DB, msg: GetChangesMsg): GetChangesResponse {
    const changes = db.getChanges(msg.requestorDbid, msg.since[0]);
    let seqEnd: Seq;
    if (changes.length === 0) {
      seqEnd = msg.since;
    } else {
      const lastChange = changes[changes.length - 1];
      seqEnd = [lastChange[5], 0];
    }
    return {
      _tag: tags.getChangesResponse,
      changes,
      seqStart: msg.since,
      seqEnd,
    };
  },

  startOutboundStream(msg: EstablishOutboundStreamMsg): OutboundStream {
    // Constructs an outbound stream
    // Registers it with FSListener
    // Returns it.
    // OutboundStream will fire events that the user can then
    // hook into their network.
    // Outbound streams need to be closed when the user is done with them.
    // Can use Sever Sent Events for this rather than websockets.
    throw new Error("Unimplemented");
  },

  // startInboundStream(): InboundStream {
  //   throw new Error();
  // }
};

function applyChangesInternal(db: DB, msg: ApplyChangesMsg) {
  const [version, seq] = (db.getSinceLastApplyStmt.get(msg.fromDbid) || [
    0n,
    0,
  ]) as [bigint, number];

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

  const [newVersion, newSeq] = db.applyChanges(msg.fromDbid, msg.changes);

  db.setSinceLastApplyStmt.run(msg.fromDbid, newVersion, newSeq);
}

export default DBSyncService;
