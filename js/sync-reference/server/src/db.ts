import { Changeset, SiteIdWire } from "./protocol.js";
import { resolve } from "import-meta-resolve";
import * as fs from "fs";
import { validate as uuidValidate, parse as uuidParse } from "uuid";

import { Database } from "better-sqlite3";
import * as SQLiteDB from "better-sqlite3";
import * as path from "path";
import config from "./config.js";
import logger from "./logger.js";

const modulePath = await resolve("@vlcn.io/crsqlite", import.meta.url);

const activeDBs = new Map<SiteIdWire, WeakRef<DB>>();
const finalizationRegistry = new FinalizationRegistry((siteId: SiteIdWire) => {
  activeDBs.delete(siteId);
});

class DB {
  #db: Database;
  #listeners = new Set<(source: SiteIdWire) => void>();

  constructor(
    public readonly siteId: SiteIdWire,
    dbPath: string,
    isNew: boolean
  ) {
    this.#db = new SQLiteDB(dbPath);

    if (isNew) {
      this.#bootstrapSiteId();
    }

    this.#db.loadExtension(new URL(modulePath).pathname);
  }

  applyChangeset(from: SiteIdWire, changes: Changeset[]) {
    // write them then notify safely

    this.#notifyListeners(from);
  }

  #notifyListeners(source: SiteIdWire) {
    for (const l of this.#listeners) {
      try {
        l(source);
      } catch (e: any) {
        logger.error(e.message);
      }
    }
  }

  onChanged(cb: () => void) {
    this.#listeners.add(cb);
    return () => this.#listeners.delete(cb);
  }

  #bootstrapSiteId() {
    // new db and the user provided a site id
    this.#db.exec(`CREATE TABLE "__crsql_siteid" (site_id)`);
    const stmt = this.#db.prepare(`INSERT INTO "__crsql_siteid" VALUES (?)`);
    stmt.run(uuidParse(this.siteId));
  }
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

  const existing = activeDBs.get(desiredDb);
  if (existing) {
    const deref = existing.deref();
    if (deref) {
      return deref;
    } else {
      activeDBs.delete(desiredDb);
    }
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

  const ret = new DB(desiredDb, dbPath, isNew);
  const ref = new WeakRef(ret);
  activeDBs.set(desiredDb, ref);
  finalizationRegistry.register(ret, desiredDb);

  return ret;
}
