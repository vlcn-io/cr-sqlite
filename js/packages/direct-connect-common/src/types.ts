export type Seq = readonly [bigint, number];

export type CID = string;
export type PackedPks = Uint8Array;
export type TableName = string;
export type Version = bigint;
export type CausalLength = bigint;
export type Val = any;

export interface ISerializer {
  readonly contentType: "application/json" | "application/octet-stream";
  encode(msg: Msg): any;
  decode(msg: any): Msg;
}

export const tags = {
  applyChanges: 0,
  getChanges: 1,
  establishOutboundStream: 2,
  ackChanges: 3,
  streamingChanges: 4,
  applyChangesResponse: 5,
  createOrMigrateResponse: 6,
  createOrMigrate: 7,
  getLastSeen: 8,
  getLastSeenResponse: 9,
  getChangesResponse: 10,
  uploadSchema: 11,
  activateSchema: 12,
  establishOutboundStreamResponse: 13,
} as const;

export type Tag = typeof tags;

export type Change = readonly [
  TableName,
  PackedPks,
  CID,
  Val,
  Version, // col version
  Version, // db version
  // site_id is omitted. Will be applied by the receiver
  // who always knows site ids in client-server setup.
  // server masks site ids of clients. This masking
  // is disallowed in p2p topologies.
  CausalLength
];

export type Msg =
  | ApplyChangesMsg
  | GetChangesMsg
  | EstablishOutboundStreamMsg
  | EstablishOutboundStreamResponse
  | AckChangesMsg
  | StreamingChangesMsg
  | ApplyChangesResponse
  | CreateOrMigrateResponse
  | CreateOrMigrateMsg
  | GetLastSeenMsg
  | GetLastSeenResponse
  | GetChangesResponse
  | UploadSchemaMsg
  | ActivateSchemaMsg;

export type ApplyChangesMsg = {
  readonly _tag: Tag["applyChanges"];
  /**
   * The database to apply the changes to.
   */
  readonly toDbid: Uint8Array;
  /**
   * The database sending the changes.
   */
  readonly fromDbid: Uint8Array;
  /**
   * Given the protocol is stateless, we need to pass the schema version
   * on every request.
   *
   * This ensures the client does not try to sync changes to the server
   * during a schema mismatch.
   */
  readonly schemaVersion: bigint;
  /**
   * The versioning information of the database sending the changes.
   */
  readonly seqStart: Seq;
  readonly seqEnd: Seq;

  /**
   * The changes to apply
   */
  readonly changes: readonly Change[];
};

export type CreateOrMigrateMsg = {
  readonly _tag: Tag["createOrMigrate"];
  readonly dbid: Uint8Array;
  readonly requestorDbid: Uint8Array;
  readonly schemaName: string;
  readonly schemaVersion: bigint;
};

export type ApplyChangesResponse = {
  readonly _tag: Tag["applyChangesResponse"];
};

export type CreateOrMigrateResponse = {
  readonly _tag: Tag["createOrMigrateResponse"];
  readonly seq: Seq;
  readonly status: "noop" | "apply" | "migrate";
};

export type StreamingChangesMsg = {
  readonly _tag: Tag["streamingChanges"];
  readonly seqStart: Seq;
  readonly seqEnd: Seq;
  readonly changes: readonly Change[];
  // streams are stateful so the stream already knows the from and to dbids
  // as well as schema version. These are negotiated on stream startup.
};

export type UploadSchemaMsg = {
  readonly _tag: Tag["uploadSchema"];
  readonly name: string;
  readonly version: bigint;
  readonly content: string;
  readonly activate: boolean;
};

export type ActivateSchemaMsg = {
  readonly _tag: Tag["activateSchema"];
  readonly name: string;
  readonly version: bigint;
};

export type GetChangesMsg = {
  readonly _tag: Tag["getChanges"];
  /**
   * The db from which to get the changes
   */
  readonly dbid: Uint8Array;
  readonly requestorDbid: Uint8Array;
  /**
   * Since when?
   */
  readonly since: Seq;
  /**
   * The schema version of the requestor.
   * Changes will not be sent if there is a mismatch.
   */
  readonly schemaVersion: bigint;
  /**
   * For query based sync, the query id(s) to get changes for.
   * TODO: do we need a seq per query id?
   */
  readonly queryIds?: readonly string[];
};

export type GetChangesResponse = {
  readonly _tag: Tag["getChangesResponse"];
  readonly seqStart: Seq;
  readonly seqEnd: Seq;
  readonly changes: readonly Change[];
};

export type GetLastSeenMsg = {
  readonly _tag: Tag["getLastSeen"];
  readonly toDbid: Uint8Array;
  readonly fromDbid: Uint8Array;
};

export type GetLastSeenResponse = {
  readonly _tag: Tag["getLastSeenResponse"];
  readonly seq: Seq;
};

/**
 * Start streaming changes to made to dbid to the client.
 * Starting from the version indicated by seqStart.
 */
export type EstablishOutboundStreamMsg = {
  readonly _tag: Tag["establishOutboundStream"];
  // The DB that should generate the outbound stream
  readonly toDbid: Uint8Array;
  // The db requesting the outbound stream
  readonly fromDbid: Uint8Array;
  readonly seqStart: Seq;
  readonly schemaVersion: bigint;
  /**
   * For query based sync, the query id(s) to get changes for.
   */
  readonly queryIds?: readonly string[];
};

export type EstablishOutboundStreamResponse = {
  readonly _tag: Tag["establishOutboundStreamResponse"];
};

export type AckChangesMsg = {
  readonly _tag: Tag["ackChanges"];
  readonly seqEnd: Seq;
  // TODO: queryIds?
};
