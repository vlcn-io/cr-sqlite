type SiteIdWire = string;
type CID = string;
type QuoteConcatedPKs = string | number;
type TableName = string;
type Version = number | string;
type TODO = any;

export type Changeset = [
  TableName,
  QuoteConcatedPKs,
  CID,
  any, // val,
  Version,
  SiteIdWire // site_id
];

export type ChangesReceivedMsg = {
  siteId: SiteIdWire;
  /**
   * seqStart must always be equal to
   * seqEnd from the prior message that was sent.
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
  changes: Changeset;
};

export type ChangesRequestedMsg = {};

export interface ClientServerWholeTblProtocol {
  /**
   * Push changes to a client connected to the server
   */
  pushChnages(): void;

  /**
   * Request changes from the client that just connected
   * to the server.
   */
  requestChanges(): void;

  /**
   * When a new client connects to the server
   */
  onNewConnection(): void;

  /**
   * When a client sends the server changes
   */
  onChangesReceived(msg: ChangesReceivedMsg): void;

  /**
   * When a client requests changes from the server.
   * The client tells the server what the last
   * version it has from the server.
   */
  onChangesRequested(msg: ChangesRequestedMsg): void;

  // if a client notices messages are out of order,
  // it should just terminate and recreate the connection
  // to restart sync.
  // onOutOfOrder
}
