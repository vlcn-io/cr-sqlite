import { Changeset, Config, Version } from "@vlcn.io/client-server-common";
import * as fs from "fs";
import { validate as uuidValidate, stringify as uuidStringify } from "uuid";

import { Database } from "better-sqlite3";
import SQLiteDB from "better-sqlite3";
import * as path from "path";
import logger from "./logger.js";
import contextStore from "./contextStore.js";

type SiteIdStr = string;
import { extensionPath } from "@vlcn.io/crsqlite";

const activeDBs = new Map<SiteIdStr, WeakRef<DB>>();
const finalizationRegistry = new FinalizationRegistry((siteId: SiteIdStr) => {
  const ref = activeDBs.get(siteId);
  const db = ref?.deref();
  if (db) {
    db.close();
  }
  activeDBs.delete(siteId);
});

class DB {
  #db: Database;
  #listeners = new Set<(source: SiteIdStr) => void>();
  #applyChangesTx;
  #pullChangesetStmt;

  constructor(
    private readonly config: Config,
    public readonly siteId: Uint8Array,
    dbPath: string,
    create?: { schemaName: string }
  ) {
    this.#db = new SQLiteDB(dbPath);
    this.#db.pragma("journal_mode = WAL");
    this.#db.pragma("synchronous = NORMAL");

    if (create) {
      this.#bootstrapSiteId();
    }

    this.#db.loadExtension(extensionPath);
    if (create) {
      this.#applySchema(create.schemaName);
    }
    this.#pullChangesetStmt = this.#db.prepare(
      `SELECT "table", "pk", "cid", "val", "col_version", "db_version" FROM crsql_changes WHERE db_version > ? AND site_id != ?`
    );
    this.#pullChangesetStmt.raw(true);

    const applyChangesStmt = this.#db.prepare(
      `INSERT INTO crsql_changes ("table", "pk", "cid", "val", "col_version", "db_version", "site_id") VALUES (?, ?, ?, ?, ?, ?, ?)`
    );

    this.#applyChangesTx = this.#db.transaction(
      (from: Uint8Array, changes: readonly Changeset[]) => {
        for (const cs of changes) {
          applyChangesStmt.run(cs[0], cs[1], cs[2], cs[3], cs[4], cs[5], from);
        }
      }
    );
  }

  get __db_for_tests(): any {
    return this.#db;
  }

  applyChangeset(from: Uint8Array, changes: readonly Changeset[]) {
    // write them then notify safely
    this.#applyChangesTx(from, changes);

    // queue this so we can finish acking before firing off more changes
    // to connected clients
    setImmediate(() => {
      this.#notifyListeners(from);
    });
  }

  pullChangeset(
    requestor: Uint8Array,
    since: readonly [Version, number]
  ): Changeset[] {
    // pull changes since the client last saw changes, excluding what the client itself sent us
    const changes = this.#pullChangesetStmt.all(
      BigInt(since[0]),
      requestor
    ) as any[];
    changes.forEach((c) => {
      c[4] = BigInt(c[4]);
      c[5] = BigInt(c[5]);
    });
    return changes;
  }

  #notifyListeners(source: Uint8Array) {
    const siteIdStr = uuidStringify(source);
    for (const l of this.#listeners) {
      try {
        l(siteIdStr);
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
    const schemaPath = path.join(this.config.schemaDir, schemaName);
    const contents = fs.readFileSync(schemaPath, {
      encoding: "utf8",
    });
    this.#db.exec(contents);
  }

  onChanged(cb: (source: SiteIdStr) => void) {
    this.#listeners.add(cb);
    return () => this.#listeners.delete(cb);
  }

  #bootstrapSiteId() {
    // new db and the user provided a site id
    try {
      this.#db.exec(`CREATE TABLE "__crsql_siteid" (site_id)`);
      const stmt = this.#db.prepare(`INSERT INTO "__crsql_siteid" VALUES (?)`);
      stmt.run(this.siteId);
    } catch (e: any) {
      logger.error(e.message);
    }
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
  config: Config,
  desiredDb: Uint8Array,
  create?: { schemaName: string }
): Promise<DB> {
  let isNew = false;
  const dsiredDbStr = uuidStringify(desiredDb);
  if (!uuidValidate(dsiredDbStr)) {
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

  const existing = activeDBs.get(dsiredDbStr);
  if (existing) {
    logger.info(`db ${dsiredDbStr} found in cache`);
    const deref = existing.deref();
    if (deref) {
      return deref;
    } else {
      activeDBs.delete(dsiredDbStr);
    }
  }

  const dbPath = path.join(config.dbDir, dsiredDbStr);
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
  const ret = new DB(config, desiredDb, dbPath, isNew ? create : undefined);
  const ref = new WeakRef(ret);
  activeDBs.set(dsiredDbStr, ref);
  finalizationRegistry.register(ret, dsiredDbStr);

  return ret;
}
