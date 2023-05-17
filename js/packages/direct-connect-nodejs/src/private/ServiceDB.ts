import SQLiteDB from "better-sqlite3";
import type { Database } from "better-sqlite3";

import { Config } from "../Types.js";

export type SchemaRow = {
  namespace: string;
  name: string;
  version: bigint;
  content: string;
  active: boolean;
};

export default class ServiceDB {
  private readonly db: Database;
  private readonly getSchemaStmt: SQLiteDB.Statement;
  private readonly listSchemasStmt: SQLiteDB.Statement;

  constructor(config: Config, bootstrap: boolean = false) {
    this.db = new SQLiteDB(config.serviceDbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    if (bootstrap) {
      this.bootstrap();
    }
    this.getSchemaStmt = this.db.prepare(
      `SELECT namespace, name, version, active, content FROM schema WHERE namespace = ? AND name = ? AND version = ?`
    );
    this.listSchemasStmt = this.db
      .prepare(
        `SELECT name, version, active, creation_time FROM schema WHERE namespace = ? ORDER BY creation_time, version DESC`
      )
      .safeIntegers(true);
  }

  bootstrap() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema (
        namespace TEXT NOT NULL,
        name TEXT NOT NULL,
        version INTEGER NOT NULL,
        content TEXT NOT NULL,
        creation_time INTEGER DEFAULT (strftime('%s', 'now')),
        active INTEGER DEFAULT FALSE,
        PRIMARY KEY (namespace, name, version)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS schema_creation_time ON schema (creation_time DESC);
    `);
  }

  __internal_getDb(): Database {
    return this.db;
  }

  getSchema(
    namespace: string,
    schemaName: string,
    version: bigint
  ): SchemaRow | undefined {
    return this.getSchemaStmt.get(namespace, schemaName, version) as any;
  }

  defaultSchemaProvider = (name: string, version: bigint) => {
    return this.getSchema("default", name, version);
  };

  listSchemas(namespace: string): Omit<SchemaRow, "content">[] {
    return this.listSchemasStmt.all(namespace) as any;
  }

  addSchema(
    namespace: string,
    schemaName: string,
    version: bigint,
    content: string,
    activate: boolean
  ) {
    this.db.transaction(() => {
      if (activate) {
        this.db
          .prepare(
            `UPDATE schema SET active = FALSE WHERE namespace = ? AND name = ?`
          )
          .run(namespace, schemaName);
      }
      this.db
        .prepare(
          `INSERT INTO schema (namespace, name, version, content, active) VALUES (?, ?, ?, ?, ?)`
        )
        .run(namespace, schemaName, version, content, activate ? 1 : 0);
    })();
  }

  activateSchemaVersion(
    namespace: string,
    schemaName: string,
    version: bigint
  ) {
    this.db.transaction(() => {
      // make sure the schema exists that we'd like to activate
      const exists = this.db
        .prepare(
          `SELECT 1 FROM schema WHERE namespace = ? AND name = ? AND version = ?`
        )
        .pluck()
        .get(namespace, schemaName, version);
      if (!exists) {
        throw new Error(
          `Attempted to activate a schema or version ${namespace}:${schemaName}:${version} which does not exist`
        );
      }
      this.db
        .prepare(
          `UPDATE schema SET active = FALSE WHERE namespace = ? AND name = ?`
        )
        .run(namespace, schemaName);
      this.db
        .prepare(
          `UPDATE schema SET active = TRUE WHERE namespace = ? AND name = ? AND version = ?`
        )
        .run(namespace, schemaName, version);
    })();
  }

  close() {
    this.db.close();
  }
}
