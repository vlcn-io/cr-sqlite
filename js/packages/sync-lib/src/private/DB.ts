import SQLiteDB from "better-sqlite3";
import type { Database } from "better-sqlite3";
import { Config } from "../Types";

/**
 * Wraps a normal better-sqlite3 connection to provide
 * easy access to things like site id, changeset pulling, seen peers.
 *
 * Creates the connection, set correct WAL mode, loads cr-sqlite extension.
 */
export default class DB {
  private readonly db: Database;

  constructor(config: Config, dbid: string) {
    this.db = new SQLiteDB(config.getDbFilename(dbid));
  }
}
