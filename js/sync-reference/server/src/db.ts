import { Changeset, SiteIdWire, Version } from "@vlcn.io/client-server-common";
import { resolve } from "import-meta-resolve";
import * as fs from "fs";
import {
  validate as uuidValidate,
  parse as uuidParse,
  stringify as uuidStringify,
} from "uuid";

import { Database } from "better-sqlite3";
import SQLiteDB from "better-sqlite3";
import * as path from "path";
import config from "./config.js";
import logger from "./logger.js";
import contextStore from "./contextStore.js";

const modulePath = await resolve("@vlcn.io/crsqlite", import.meta.url);

const activeDBs = new Map<SiteIdWire, WeakRef<DB>>();
const finalizationRegistry = new FinalizationRegistry((siteId: SiteIdWire) => {
  const ref = activeDBs.get(siteId);
  const db = ref?.deref();
  if (db) {
    db.close();
  }
  activeDBs.delete(siteId);
});

class DB {
  #db: Database;
  #listeners = new Set<(source: SiteIdWire) => void>();
  #applyChangesTx;
  #pullChangesetStmt;

  constructor(
    public readonly siteId: SiteIdWire,
    dbPath: string,
    create?: { schemaName: string }
  ) {
    this.#db = new SQLiteDB(dbPath);

    if (create) {
      this.#bootstrapSiteId();
    }

    this.#db.loadExtension(new URL(modulePath).pathname);
    if (create) {
      this.#applySchema(create.schemaName);
    }
    this.#pullChangesetStmt = this.#db.prepare(
      `SELECT "table", "pk", "cid", "val", "col_version", "db_version", "site_id" FROM crsql_changes WHERE db_version > ? AND site_id != ?`
    );
    this.#pullChangesetStmt.raw(true);

    const applyChangesStmt = this.#db.prepare(
      `INSERT INTO crsql_changes ("table", "pk", "cid", "val", "col_version", "db_version", "site_id") VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    this.#applyChangesTx = this.#db.transaction((changes: Changeset[]) => {
      for (const cs of changes) {
        applyChangesStmt.run(
          cs[0],
          cs[1],
          cs[2],
          cs[3],
          BigInt(cs[4]),
          BigInt(cs[5]),
          cs[6] ? uuidParse(cs[6]) : null
        );
      }
    });
  }

  get __db_for_tests(): any {
    return this.#db;
  }

  applyChangeset(from: SiteIdWire, changes: Changeset[]) {
    // write them then notify safely
    this.#applyChangesTx(changes);

    // queue this so we can finish acking before firing off more changes
    // to connected clients
    setImmediate(() => {
      this.#notifyListeners(from);
    });
  }

  pullChangeset(requestor: SiteIdWire, since: [Version, number]): Changeset[] {
    // pull changes since the client last saw changes, excluding what the client itself sent us
    const changes = this.#pullChangesetStmt.all(
      BigInt(since[0]),
      uuidParse(requestor)
    );
    changes.forEach((c) => {
      // we mask the site ids of clients via the server site id
      // 1. for privacy
      // 2. to prevent looping during proxying
      // c[6] = this.siteId;
      // since BigInt doesn't serialize -- convert to string
      c[4] = c[4].toString();
      c[5] = c[5].toString();
      c[6] = uuidStringify(c[6]);
    });
    return changes;
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

  // TODO: the whol migration story to figure out...
  // and either:
  // 1. schema replication to clients
  // or
  // 2. no sync till clients upgrade
  #applySchema(schemaName: string) {
    // TODO: make this promise based
    const schemaPath = path.join(config.get.schemaDir, schemaName);
    const contents = fs.readFileSync(schemaPath, {
      encoding: "utf8",
    });
    this.#db.exec(contents);
  }

  onChanged(cb: (source: SiteIdWire) => void) {
    this.#listeners.add(cb);
    return () => this.#listeners.delete(cb);
  }

  #bootstrapSiteId() {
    // new db and the user provided a site id
    this.#db.exec(`CREATE TABLE "__crsql_siteid" (site_id)`);
    const stmt = this.#db.prepare(`INSERT INTO "__crsql_siteid" VALUES (?)`);
    stmt.run(uuidParse(this.siteId));
  }

  close() {
    try {
      this.#db.exec("SELECT crsql_finalize();");
      this.#db.close();
    } catch (e: any) {
      logger.error(e.message, {
        event: "DB.close.fail",
        dbid: this.siteId,
        req: contextStore.get().reqId,
      });
    }
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
    logger.error("invalid uuid", {
      event: "dbFactory.invalidUuid",
      desiredDb,
      req: contextStore.get().reqId,
      create,
    });
    throw new Error("Invalid UUID supplied for DBID");
  }

  if (create) {
    const schemaName = create.schemaName;
    const match = schemaName.match(/^[a-zA-Z0-9\-_]+$/);
    if (match == null) {
      logger.error("bad schema name", {
        event: "DB.#applySchema",
        schemaName,
        db: desiredDb,
        req: contextStore.get().reqId,
      });
      throw new Error(
        "invalid schema name provided. Must only contain alphanumeric characters and/or -, _"
      );
    }
  }

  const existing = activeDBs.get(desiredDb);
  if (existing) {
    logger.info(`db ${desiredDb} found in cache`);
    const deref = existing.deref();
    if (deref) {
      return deref;
    } else {
      activeDBs.delete(desiredDb);
    }
  }

  const dbPath = path.join(config.get.dbDir, desiredDb);
  try {
    await fs.promises.access(dbPath, fs.constants.F_OK);
  } catch (e) {
    if (!create) {
      logger.error("no db, no create", {
        event: "dbFactory.nodb",
        desiredDb,
        req: contextStore.get().reqId,
      });
      throw e;
    }
    // otherwise create the thing
    isNew = true;
  }

  // do not pass create arg if the db already exists.
  const ret = new DB(desiredDb, dbPath, isNew ? create : undefined);
  const ref = new WeakRef(ret);
  activeDBs.set(desiredDb, ref);
  finalizationRegistry.register(ret, desiredDb);

  return ret;
}
