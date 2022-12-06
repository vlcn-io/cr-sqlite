export type SiteIdWire = string;
export type CID = string;
export type QuoteConcatedPKs = string | number;
export type TableName = string;
export type Version = number | string;
type TODO = any;

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
  Version,
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
  from: SiteIdWire;
  seqStart: [Version, number];
};

export type ChangesAckedMsg = {
  _tag: "ack";
  from: SiteIdWire;
  seqEnd: [Version, number];
};

export type EstablishConnectionMsg = {
  _tag: "establish";
  from: SiteIdWire;
  to: SiteIdWire;
  // if the db doesn't exist the user can create it
  // with the provided schema name.
  // obviously we need some form of auth around this
  // and tracking as to how much data the user is using.
  create?: {
    schemaName: string;
  };
};

export interface CentralWholeTblStreamProtocol {
  /**
   * Push changes to a client connected to the server.
   * We need a way to implement backpressure
   */
  pushChanges(to: SiteIdWire, changes: Changeset[]): void;

  /**
   * Request changes from the given site since the
   * given version.
   */
  requestChanges(from: SiteIdWire, since: Version): void;

  /**
   * When a new client connects to the server
   */
  onNewConnection?: (siteId: SiteIdWire) => void;

  /**
   * When a client requests changes from the server.
   * The client tells the server what the last
   * version it has from the server.
   */
  onChangesRequested?: (msg: ChangesRequestedMsg) => void;

  /**
   * When a client sends the server changes
   */
  onChangesReceived?: (msg: ChangesReceivedMsg) => Promise<void>;

  onChangesAcked?: (msg: ChangesAckedMsg) => Promise<void>;

  // if a client notices messages are out of order,
  // it should just terminate and recreate the connection
  // to restart sync.
  // onOutOfOrder
}
