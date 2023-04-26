type TODO = any;

/**
 * Sync interface once you have a DB instance in-hand.
 *
 * SyncService provides a higher level API that re-uses
 * existing DBSync instances and connections to them.
 */
export default class DBSync {
  constructor(db: TODO) {}

  applyChanges(startSeq: Seq, endSeq: Seq, changes: TODO) {}

  getChanges(since: Seq): [Seq, Seq, TODO] {
    throw new Error();
  }
}
