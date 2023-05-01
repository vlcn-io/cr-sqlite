import SQLiteDB from "better-sqlite3";
import type { Database } from "better-sqlite3";

import { Config } from "../Types";

export default class ServiceDB {
  private readonly db: Database;
  private readonly currentSchemaVersionStmt: SQLiteDB.Statement;
  private readonly getSchemaStmt: SQLiteDB.Statement;
  private readonly listSchemasStmt: SQLiteDB.Statement;

  constructor(config: Config) {
    this.db = new SQLiteDB(config.serviceDbPath);
    this.currentSchemaVersionStmt = this.db.prepare(
      `SELECT version FROM schema WHERE namespace = ? AND name = ? ORDER BY creation_time DESC LIMIT 1`
    );
    this.getSchemaStmt = this.db.prepare(
      `SELECT content FROM schema WHERE namespace = ? AND name = ? AND version = ?`
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
        creation_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (namespace, name, version)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS schema_creation_time ON schema (creation_time DESC);
    `);
  }

  /**
   *
   * @param namespace
   * @param schemaName
   */
  getCurrentSchemaVersion(namespace: string, schemaName: string) {
    return this.currentSchemaVersionStmt
      .pluck()
      .get(namespace, schemaName) as string;
  }

  getSchema(namespace: string, schemaName: string, version: string) {
    return this.getSchemaStmt
      .pluck()
      .get(namespace, schemaName, version) as string;
  }

  listSchemas(namespace: string) {
    return this.listSchemasStmt.all(namespace);
  }

  addSchema(
    namespace: string,
    schemaName: string,
    version: string,
    content: string
  ) {
    this.db
      .prepare(
        `INSERT INTO schema (namespace, name, version, content) VALUES (?, ?, ?, ?)`
      )
      .run(namespace, schemaName, version, content);
  }
}
