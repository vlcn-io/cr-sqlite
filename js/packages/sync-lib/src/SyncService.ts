import DBCache from "./DBCache.js";
import DBSyncService from "./DBSyncService.js";
import OutboundStream from "./OutboundStream.js";
import {
  AckChangesMsg,
  ApplyChangesMsg,
  Change,
  Config,
  CreateOrMigrateMsg,
  EstablishOutboundStreamMsg,
  GetChangesMsg,
} from "./Types";

// TODO: add a DB cache with a TTL so as not to re-create
// dbs on every request?
export default class SyncService {
  constructor(
    public readonly config: Config,
    private readonly dbCache: DBCache
  ) {}

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
  createOrMigrateDatabase(msg: CreateOrMigrateMsg): void {
    const db = this.dbCache.get(msg.dbid);
    const svc = new DBSyncService(db);
    svc.maybeMigrate(msg.schemaName, msg.schemaVersion);
  }

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

  applyChanges(msg: ApplyChangesMsg): void {}

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
  startOutboundStream(msg: EstablishOutboundStreamMsg): OutboundStream {
    throw new Error();
  }

  /**
   * Starts a stateful inbound stream.
   *
   * applyChanges is not stateful and does a bit of extra work
   * on every request.
   *
   * InboundChanges maintains state in-memory that would normally be
   * re-created on every request to applyChanges.
   *
   * See docs on InboundStream.
   *
   * And inbound stream manages a direct connection between the
   * db and the client.
   *
   * The returned inbound stream can be hooked into your msg handler
   * to apply changes to the db.
   */
  // startInboundStream(): InboundStream {
  //   // unclear how inbound stream should work...
  //   throw new Error();
  // }
}
