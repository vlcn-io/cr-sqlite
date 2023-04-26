export type Config = {
  /**
   * Service name is available in case you host many different sync services.
   * Maybe you have several where each get their own schema and db dirs.
   */
  readonly serviceName: string;
  /**
   * Where schema files should be uploaded to on your server.
   */
  readonly schemasDir: string;
  /**
   * Where SQLite databases should be created and persisted.
   */
  readonly dbsDir: string;
};

export type Seq = readonly [bigint, number];

export type CID = string;
export type QuoteConcatedPKs = string;
export type TableName = string;
export type Version = bigint;
export type Val = string | null;

export type Change = readonly [
  TableName,
  QuoteConcatedPKs,
  CID,
  Val,
  Version, // col version
  Version // db version
  // site_id is omitted. Will be applied by the receiver
  // who always knows site ids in client-server setup.
  // server masks site ids of clients. This masking
  // is disallowed in p2p topologies.
];

export type ApplyChangesMsg = {
  readonly _tag: "applyChanges";
  /**
   * The database to apply the changes to.
   */
  readonly toDbid: string;
  /**
   * The database sending the changes.
   */
  readonly fromDbid: string;
  /**
   * Given the protocol is stateless, we need to pass the schema version
   * on every request.
   *
   * This ensures the client does not try to sync changes to the server
   * during a schema mismatch.
   */
  readonly schemaVersion: string;
  /**
   * The versioning information of the database sending the changes.
   */
  readonly seqStart: Seq;

  /**
   * The changes to apply
   */
  readonly changes: readonly Change[];
};

export type GetChangesMsg = {
  readonly _tag: "getChanges";
  /**
   * The db from which to get the changes
   */
  readonly dbid: string;
  /**
   * Since when?
   */
  readonly since: Seq;
  /**
   * The schema version of the requestor.
   * Changes will not be sent if there is a mismatch.
   */
  readonly schemaVersion: string;
  /**
   * For query based sync, the query id(s) to get changes for.
   */
  readonly queryIds?: readonly string[];
};

/**
 * Start streaming changes to made to dbid to the client.
 * Starting from the version indicated by seqStart.
 */
export type EstablishStreamMsg = {
  readonly _tag: "establishStream";
  readonly dbid: string;
  readonly seqStart: Seq;
  readonly schemaVersion: string;
};

export default class SyncService {
  constructor(public readonly config: Config) {}

  /**
   * Will create the database if it does not exist and apply the schema.
   * If the database does exist, it will migrate the schema.
   * If there was no schema update this is a no-op.
   *
   * If we need to migrate the DB, any streaming connections to it
   * are closed.
   *
   * Any new connections are refused until the migration completes.
   *
   * @param dbid
   * @param schema
   */
  createOrMigrateDatabase(dbid: string, schemaName: string) {}

  /**
   * Upload a new schema to the server.
   * You should have auth checks around this.
   *
   * Migrations are done lazily as database connections are opened.
   *
   * The server will retain all copies of the schema for debugging purposes.
   * You can remove old copies of the schema through the `listSchemas` and
   * `deleteSchema` methods.
   */
  uploadSchema(
    schemaName: string,
    schemaContents: string,
    schemaVersion: string
  ) {
    throw new Error();
  }

  listSchemas(): string[] {
    return [];
  }

  applyChanges(msg: ApplyChangesMsg) {}

  /**
   * Clients should only ever have 1 outstanding `getChanges` request to the same DBID at a time.
   * If a client issues a getChanges request to the same DB while they have one in-flight,
   * they should ignore the response to the first request.
   * @param msg
   * @returns
   */
  getChanges(msg: GetChangesMsg): Change[] {
    return [];
  }

  /**
   * Start streaming changes from the server to the client
   * such that the client does not have to issue a request
   * for changes.
   */
  startOutboundStream(msg: EstablishStreamMsg): OutboundStream {}
}
