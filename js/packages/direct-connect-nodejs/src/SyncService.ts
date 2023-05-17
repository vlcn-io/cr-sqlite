import DBCache from "./private/DBCache.js";
import DBSyncService from "./DBSyncService.js";
import OutboundStream from "./private/OutboundStream.js";
import {
  ActivateSchemaMsg,
  ApplyChangesMsg,
  ApplyChangesResponse,
  CreateOrMigrateMsg,
  CreateOrMigrateResponse,
  EstablishOutboundStreamMsg,
  EstablishOutboundStreamResponse,
  GetChangesMsg,
  GetChangesResponse,
  GetLastSeenMsg,
  GetLastSeenResponse,
  UploadSchemaMsg,
  tags,
} from "@vlcn.io/direct-connect-common";
import ServiceDB from "./private/ServiceDB.js";
import FSNotify from "./private/FSNotify.js";
import { Config } from "./Types.js";

export default class SyncService {
  constructor(
    public readonly config: Config,
    private readonly dbCache: DBCache,
    private readonly serviceDB: ServiceDB,
    private readonly fsNotify?: FSNotify
  ) {}

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
  uploadSchema(msg: UploadSchemaMsg) {
    this.serviceDB.addSchema(
      "default",
      msg.name,
      msg.version,
      msg.content,
      msg.activate
    );
  }

  activateSchemaVersion(msg: ActivateSchemaMsg) {
    this.serviceDB.activateSchemaVersion("default", msg.name, msg.version);
  }

  listSchemas(): {
    name: string;
    version: bigint;
    active: boolean;
  }[] {
    return this.serviceDB.listSchemas("default");
  }

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
  createOrMigrateDatabase(msg: CreateOrMigrateMsg): CreateOrMigrateResponse {
    const db = this.dbCache.get(msg.dbid);
    return DBSyncService.maybeMigrate(
      db,
      msg.schemaName,
      msg.schemaVersion,
      msg.requestorDbid
    );
  }

  /**
   * Take in a set of changes, apply them, return acknolwedgement.
   */
  applyChanges(msg: ApplyChangesMsg): ApplyChangesResponse {
    const db = this.dbCache.get(msg.toDbid);
    return DBSyncService.applyChanges(db, msg);
  }

  /**
   * Clients should only ever have 1 outstanding `getChanges` request to the same DBID at a time.
   * If a client issues a getChanges request to the same DB while they have one in-flight,
   * they should ignore the response to the first request.
   * @param msg
   * @returns
   */
  getChanges(msg: GetChangesMsg): GetChangesResponse {
    const db = this.dbCache.get(msg.dbid);
    return DBSyncService.getChanges(db, msg);
  }

  getLastSeen(msg: GetLastSeenMsg): GetLastSeenResponse {
    const db = this.dbCache.get(msg.toDbid);
    return DBSyncService.getLastSeen(db, msg);
  }

  /**
   * Start streaming changes from the server to the client
   * such that the client does not have to issue a request
   * for changes.
   */
  startOutboundStream(
    msg: EstablishOutboundStreamMsg
  ): [OutboundStream, EstablishOutboundStreamResponse] {
    // 1. create the outbound stream
    // 2. return it so the user can wire it up to their SSE or websocket or whatever.
    const os = new OutboundStream(this.fsNotify!, this.serviceDB, msg);
    os.start();
    return [
      os,
      {
        _tag: tags.establishOutboundStreamResponse,
      },
    ];
  }

  shutdown() {
    this.dbCache.destroy();
    this.serviceDB.close();
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
