export type SiteIdWire = string;
export type CID = string;
export type QuoteConcatedPKs = string | number;
export type TableName = string;
export type Version = number | string;

export type Msg =
  | ChangesReceivedMsg
  | ChangesRequestedMsg
  | ChangesAckedMsg
  | EstablishConnectionMsg;

export type Changeset = [
  TableName,
  QuoteConcatedPKs,
  CID,
  any, // val,
  Version, // col version
  Version, // db version
  SiteIdWire // site_id
];

export type ChangesReceivedMsg = {
  _tag: "receive";
  from: SiteIdWire;
  /**
   * seqStart must always be equal to
   * seqEnd from the prior message that was sent (or the change request msg if first change).
   * This is to ensure ordered delivery.
   *
   * seqStart thus does not necessarilly correspond
   * to the smallest version nunmber in the changeset.
   *
   * seqEnd, however, will be the largest version number
   * in the changeset.
   *
   * Since versions can never run backwards,
   * seqEnd will never be duplicative
   *
   * The second element in the tuple
   * is for future use when we allow breaking
   * apart large transactions into many messages.
   */
  seqStart: [Version, number];
  seqEnd: [Version, number];
  changes: Changeset[];
};

export type ChangesRequestedMsg = {
  _tag: "request";
  seqStart: [Version, number];
};

export type ChangesAckedMsg = {
  _tag: "ack";
  seqEnd: [Version, number];
};

export type EstablishConnectionMsg = {
  _tag: "establish";
  from: SiteIdWire;
  to: SiteIdWire;
  seqStart: [Version, number];
  // if the db doesn't exist the user can create it
  // with the provided schema name.
  // obviously we need some form of auth around this
  // and tracking as to how much data the user is using.
  create?: {
    schemaName: string;
  };
};
