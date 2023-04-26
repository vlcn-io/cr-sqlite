import OutboundStream from "./OutboundStream";

type TODO = any;

/**
 * Sync interface once you have a DB instance in-hand.
 *
 * SyncService provides a higher level API that re-uses
 * existing DBSync instances and connections to them.
 */
export default class DBService {
  constructor(db: TODO) {}

  // Keep track of outbound streams we've given out
  // so we can shut them down on close.
}
