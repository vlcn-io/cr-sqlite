import SQLiteDB from "better-sqlite3";
import type { Database } from "better-sqlite3";

import { Config } from "../Types";

export type SchemaRow = {
  namespace: string;
  name: string;
  version: string;
  content: string;
  active: boolean;
};

export default class ServiceDB {
  private readonly db: Database;
  private readonly currentSchemaVersionStmt: SQLiteDB.Statement;
  private readonly getSchemaStmt: SQLiteDB.Statement;
  private readonly listSchemasStmt: SQLiteDB.Statement;

  constructor(config: Config, bootstrap: boolean = false) {
    this.db = new SQLiteDB(config.serviceDbPath);
    if (bootstrap) {
      this.bootstrap();
    }
    this.currentSchemaVersionStmt = this.db.prepare(
      `SELECT version FROM schema WHERE namespace = ? AND name = ? ORDER BY creation_time DESC LIMIT 1`
    );
    this.getSchemaStmt = this.db.prepare(
      `SELECT namespace, name, version, active, content FROM schema WHERE namespace = ? AND name = ? AND version = ?`
    );
    this.listSchemasStmt = this.db.prepare(
      `SELECT name, version FROM schema WHERE namespace = ?`
    );
  }

  bootstrap() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema (
        namespace TEXT NOT NULL,
        name TEXT NOT NULL,
        version TEXT NOT NULL,
        content TEXT NOT NULL,
        creation_time INTEGER DEFAULT (strftime('%s', 'now')),
        active BOOLEAN DEFAULT FALSE,
        PRIMARY KEY (namespace, name, version)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS schema_creation_time ON schema (creation_time DESC);
    `);
  }

  getSchema(
    namespace: string,
    schemaName: string,
    version: string
  ): SchemaRow | undefined {
    return this.getSchemaStmt.get(namespace, schemaName, version) as any;
  }

  listSchemas(namespace: string) {
    return this.listSchemasStmt.all(namespace);
  }

  addSchema(
    namespace: string,
    schemaName: string,
    version: string,
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
        .run(namespace, schemaName, version, content, activate);
    })();
  }

  activateSchemaVersion(
    namespace: string,
    schemaName: string,
    version: string
  ) {
    this.db.transaction(() => {
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
