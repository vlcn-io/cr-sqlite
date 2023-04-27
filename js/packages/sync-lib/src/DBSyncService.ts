import OutboundStream from "./OutboundStream.js";
import {
  ApplyChangesMsg,
  ApplyChangesResponse,
  Change,
  EstablishOutboundStreamMsg,
  GetChangesMsg,
  tags,
} from "./Types.js";

type TODO = any;

/**
 * Sync interface once you have a DB instance in-hand.
 *
 * Useful for stateful sync services that do not re-create db connections
 * on every request.
 */
export default class DBSyncService {
  constructor(db: TODO) {}

  maybeMigrate(schemaName: string) {}

  /**
   * Applies changes with sanity checking to esnure contiguity of messages.
   *
   *
   * @param msg
   */
  applyChanges(msg: ApplyChangesMsg): ApplyChangesResponse {
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
