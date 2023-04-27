import OutboundStream from "./OutboundStream.js";
import {
  ApplyChangesMsg,
  ApplyChangesResponse,
  Change,
  EstablishOutboundStreamMsg,
  GetChangesMsg,
  MigrateToResponse,
  tags,
} from "./Types.js";
import DB from "./private/DB.js";

/**
 * Sync interface once you have a DB instance in-hand.
 *
 * Useful for stateful sync services that do not re-create db connections
 * on every request.
 */
export default class DBSyncService {
  constructor(private readonly db: DB) {}

  async maybeMigrate(
    schemaName: string,
    version: string
  ): Promise<MigrateToResponse> {
    const status = await this.db.migrateTo(schemaName, version);
    return {
      _tag: tags.createOrMigrateResponse,
      status,
    };
  }

  /**
   * Applies changes with sanity checking to esnure contiguity of messages.
   *
   *
   * @param msg
   */
  applyChanges(msg: ApplyChangesMsg): ApplyChangesResponse {
    // 1. ensure contiguity of messages by checking seqStart against seen_peers
    // 2. apply changes in a transaction and update seen_peers
    // 3. return status
    return {
      _tag: tags.applyChangesResponse,
      status: "ok",
    };
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
    throw new Error();
  }

  // startInboundStream(): InboundStream {
  //   throw new Error();
  // }

  close() {
    // closes all associated outbound streams and this db.
    // removes from DB cache as well.
  }
}
