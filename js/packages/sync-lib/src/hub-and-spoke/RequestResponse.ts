type TODO = any;
type Seq = [bigint, number];

export default class RequestResponse {
  constructor(db: TODO) {}

  applyChanges(startSeq: Seq, endSeq: Seq, changes: TODO) {}

  getChanges(since: Seq): [Seq, Seq, TODO] {
    throw new Error();
  }
}
