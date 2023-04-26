import InboundStream from "./InboundStream";
import OutboundStream from "./OutboundStream";
import { ApplyChangesMsg, Change, GetChangesMsg } from "./Types";

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

  applyChanges(msg: ApplyChangesMsg) {}

  getChanges(msg: GetChangesMsg): Change[] {
    return [];
  }

  startOutboundStream(): OutboundStream {
    // Constructs an outbound stream
    // Registers it with FSListener
    // Returns it.
    // OutboundStream will fire events that the user can then
    // hook into their network.
    // Outbound streams need to be closed when the user is done with them.
    throw new Error();
  }

  startInboundStream(): InboundStream {}
}
