import { Changeset, SiteIdWire } from "./protocol.js";
import { resolve } from "import-meta-resolve";
import * as fs from "fs";
import { validate as uuidValidate } from "uuid";

import { Database } from "better-sqlite3";
import * as SQLiteDB from "better-sqlite3";
import * as path from "path";
import config from "./config.js";

const modulePath = await resolve("@vlcn.io/crsqlite", import.meta.url);

// Map of weak refs to DB instances

class DB {
  #db: Database;
  constructor(
    public readonly siteId: SiteIdWire,
    dbPath: string,
    isNew: boolean
  ) {
    this.#db = new SQLiteDB(dbPath);

    if (isNew) {
      this.#bootstrapSiteId();
    }

    // now load extensions
  }

  applyChangeset(changes: Changeset[]) {}

  onChanged(cb: () => void) {}

  #bootstrapSiteId() {}
}

export type DBType = DB;

// If the DB doesn't exist, we could create it.
// Note: how does this work in a distributed setting via litefs? Any concurrency issues of
// two nodes creating the same db at the same time?
//
// Note: creating the DB should be an _explicit_ operation
// requested by the end user and requires a schema for the db to use.
export default async function dbFactory(
  desiredDb: SiteIdWire,
  create?: { schemaName: string }
): Promise<DB> {
  let isNew = false;
  if (!uuidValidate(desiredDb)) {
    throw new Error("Invalid UUID supplied for DBID");
  }

  const dbPath = path.join(config.dbDir, desiredDb);
  try {
    await fs.promises.access(dbPath, fs.constants.F_OK);
  } catch (e) {
    if (!create) {
      throw e;
    }
    // otherwise create the thing
  }

  return new DB(desiredDb, dbPath, isNew);
}
