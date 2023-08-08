import Database from "better-sqlite3";
import { config } from "./config";
import path from "node:path";
import fs from "node:fs";
import { extensionPath } from "@vlcn.io/crsqlite";
import { cryb64 } from "@vlcn.io/partykit-common";

/**
 * Abstracts over a DB and provides just the operations requred by the sync server.
 */
export default class DB {
  readonly #db;
  readonly #schemaName;
  readonly #schemaVersion;
  readonly #changeCallbacks = new Set<() => void>();

  constructor(
    name: string,
    requestedSchema: string,
    requestedSchemaVersion: bigint
  ) {
    // TODO: different rooms may need different DB schemas.
    // We should support some way of defining this.
    const db = new Database(getDbPath(name));
    this.#db = db;
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");
    db.loadExtension(extensionPath);

    const schemaName = db
      .prepare("SELECT value FROM crsql_master WHERE key = 'schema_name'")
      .pluck()
      .get() as string | undefined;

    if (schemaName == null) {
      [this.#schemaName, this.#schemaVersion] = this.#applySchema(
        requestedSchema,
        requestedSchemaVersion
      );
      return;
    } else if (schemaName != requestedSchema) {
      throw new Error(
        `${requestedSchema} requested but the db is already configured with ${schemaName}`
      );
    }

    let schemaVersion = db
      .prepare("SELECT value FROM crsql_master WHERE key = 'schema_version'")
      .safeIntegers(true)
      .pluck()
      .get() as bigint | undefined;

    if (schemaVersion == null) {
      throw new Error(`Schema ${schemaName} was presente but with no version!`);
    }

    if (schemaVersion != requestedSchemaVersion) {
      schemaVersion = this.#tryUpdatingSchema(
        schemaName,
        requestedSchemaVersion
      );
      if (schemaVersion !== requestedSchemaVersion) {
        throw new Error(
          `The server is at schema version ${schemaVersion} which is not the same as the requested version ${requestedSchemaVersion}`
        );
      }
    }

    // We're on a matching version with the client.
    this.#schemaName = schemaName;
    this.#schemaVersion = schemaVersion;
  }

  getLastSeen(site: Uint8Array): [bigint, number] {
    return [0n, 0];
  }

  schemasMatch(schemaName: string, schemaVersion: bigint): boolean {
    return (
      schemaName === this.#schemaName && schemaVersion === this.#schemaVersion
    );
  }

  onChange(cb: () => void) {
    this.#changeCallbacks.add(cb);
    return () => {
      this.#changeCallbacks.delete(cb);
    };
  }

  /**
   * A trivial `onChange` implementation.
   *
   * Our other server implementations support geo-distributed strongly consistent replication of the DB **and** change
   * notification.
   *
   * This here only supports monitoring changes to a DB that are made through the same instance
   * of this class. Given all connections share the same DB instance, via DBCache, this works for now.
   *
   * @param cb
   */
  #notifyOfChange() {}

  close() {
    this.#db.prepare;
  }

  // No schema exists on the db. Straight apply it.
  #applySchema(name: string, version: bigint): [string, bigint] {
    const content = fs.readFileSync(getSchemaPath(name), "utf-8");
    const residentVersion = cryb64(content);
    if (residentVersion != version) {
      throw new Error(
        `Server has schema version ${residentVersion} but client requested ${version}`
      );
    }
    this.#db.transaction(() => {
      this.#db.exec(content);
      this.#db
        .prepare(
          `INSERT OR REPLACE INTO crsql_master (key, value) VALUES (?, ?)`
        )
        .run("schema_version", version);
      this.#db
        .prepare(
          `INSERT OR REPLACE INTO crsql_master (key, value) VALUES (?, ?)`
        )
        .run("schema_name", name);
    })();

    return [name, version];
  }

  // A schema exists and the client requested a version different than
  // the installed version. Try updating.
  #tryUpdatingSchema(schemaName: string, requestedVersion: bigint): bigint {
    const content = fs.readFileSync(getSchemaPath(schemaName), "utf-8");
    const residentVersion = cryb64(content);
    if (residentVersion != requestedVersion) {
      throw new Error(
        `Server has schema version ${residentVersion} but client requested ${requestedVersion}`
      );
    }

    this.#db.transaction(() => {
      this.#db.prepare(`SELECT crsql_automigrate(?)`).run(content);
      this.#db
        .prepare(
          `INSERT OR REPLACE INTO crsql_master (key, value) VALUES (?, ?)`
        )
        .run("schema_version", requestedVersion);
    })();

    return requestedVersion;
  }
}

function getDbPath(dbName: string) {
  if (hasPathParts(dbName)) {
    throw new Error(`${dbName} must not include '..', '/', or '\\'`);
  }

  return path.join(config.dbFolder, dbName);
}

function getSchemaPath(schemaName: string) {
  if (hasPathParts(schemaName)) {
    throw new Error(`${schemaName} must not include '..', '/', or '\\'`);
  }

  return path.join(config.schemaFolder, schemaName);
}

function hasPathParts(s: string) {
  return s.includes("..") || s.includes("/") || s.includes("\\");
}
