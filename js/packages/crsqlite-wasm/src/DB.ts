import {
  DBAsync,
  StmtAsync,
  TXAsync,
  UpdateType,
  cryb64,
  firstPick,
} from "@vlcn.io/xplat-api";
import { SQLITE_UTF8 } from "@vlcn.io/wa-sqlite";
import { serialize, topLevelMutex } from "./serialize.js";
import Stmt from "./Stmt.js";
import TX from "./TX.js";

export class DB implements DBAsync {
  public readonly __mutex = topLevelMutex;
  private stmtFinalizer = new Map<number, WeakRef<Stmt>>();
  // private stmtFinalizationRegistry = new FinalizationRegistry(
  //   (base: number) => {
  //     const ref = this.stmtFinalizer.get(base);
  //     const stmt = ref?.deref();
  //     if (stmt) {
  //       console.log("finalized ", base);
  //       stmt.finalize();
  //     }
  //     this.stmtFinalizer.delete(base);
  //   }
  // );
  #siteid: string | null = null;

  private cache = new Map<string, Promise<any>>();
  #updateHooks: Set<
    (type: UpdateType, dbName: string, tblName: string, rowid: bigint) => void
  > | null = null;
  #closed = false;
  #tx: TX;

  constructor(
    public api: SQLiteAPI,
    public db: number,
    public readonly filename: string
  ) {
    this.#tx = new TX(
      api,
      db,
      topLevelMutex,
      this.#assertOpen,
      this.stmtFinalizer
    );
  }

  get siteid(): string {
    return this.#siteid!;
  }

  _setSiteid(siteid: string) {
    if (this.#siteid) {
      throw new Error("Site id already set");
    }
    this.#siteid = siteid;
  }

  async automigrateTo(
    schemaName: string,
    schemaContent: string
  ): Promise<"noop" | "apply" | "migrate"> {
    // less safety checks for local db than server db.
    const version = cryb64(schemaContent);
    const storedName = firstPick(
      await this.execA(
        `SELECT value FROM crsql_master WHERE key = 'schema_name'`
      )
    );
    const storedVersion = firstPick(
      await this.execA(
        `SELECT value FROM crsql_master WHERE key = 'schema_version'`
      )
    ) as bigint | number | undefined;

    if (storedName === schemaName && BigInt(storedVersion || 0) === version) {
      return "noop";
    }

    const ret =
      storedName === undefined || storedName !== schemaName
        ? "apply"
        : "migrate";

    await this.tx(async (tx) => {
      if (storedVersion == null || storedName !== schemaName) {
        if (storedName !== schemaName) {
          // drop all tables since a schema name change is a reformat of the db.
          const tables = await tx.execA(
            `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'crsql_%'`
          );
          for (const table of tables) {
            await tx.exec(`DROP TABLE [${table[0]}]`);
          }
        }
        await tx.exec(schemaContent);
      } else {
        await tx.exec(
          `SELECT crsql_automigrate(?, 'SELECT crsql_finalize();')`,
          [schemaContent]
        );
      }
      await tx.exec(
        `INSERT OR REPLACE INTO crsql_master (key, value) VALUES (?, ?)`,
        ["schema_version", version]
      );
      await tx.exec(
        `INSERT OR REPLACE INTO crsql_master (key, value) VALUES (?, ?)`,
        ["schema_name", schemaName]
      );
    });
    await this.exec(`VACUUM;`);

    return ret;
  }

  execMany(sql: string[]): Promise<any> {
    return this.#tx.execMany(sql);
  }

  exec(sql: string, bind?: SQLiteCompatibleType[]): Promise<void> {
    return this.#tx.exec(sql, bind);
  }

  #assertOpen = () => {
    if (this.#closed) {
      throw new Error("The DB is closed");
    }
  };

  /**
   * @returns returns an object for each row, e.g. `{ col1: valA, col2: valB, ... }`
   */
  execO<T extends {}>(
    sql: string,
    bind?: SQLiteCompatibleType[]
  ): Promise<T[]> {
    return this.#tx.execO(sql, bind);
  }

  // TODO: execOCached() -- which takes a table list

  /**
   * @returns returns an array for each row, e.g. `[ valA, valB, ... ]`
   */
  execA<T extends any[]>(
    sql: string,
    bind?: SQLiteCompatibleType[]
  ): Promise<T[]> {
    return this.#tx.execA(sql, bind);
  }

  prepare(sql: string): Promise<StmtAsync> {
    return this.#tx.prepare(sql);
  }

  tx(cb: (tx: TXAsync) => Promise<void>): Promise<void> {
    return this.#tx.tx(cb);
  }

  imperativeTx(): Promise<[() => void, TXAsync]> {
    return this.#tx.imperativeTx();
  }

  /**
   * Close the database and finalize any prepared statements that were not freed for the given DB.
   */
  async close(): Promise<any> {
    for (const ref of this.stmtFinalizer.values()) {
      const stmt = ref.deref();
      if (stmt) {
        await stmt.finalize(this);
      }
    }
    return this.exec("SELECT crsql_finalize()").then(() => {
      this.#closed = true;
      return serialize(
        this.cache,
        undefined,
        () => this.api.close(this.db),
        this.__mutex
      );
    });
  }

  createFunction(name: string, fn: (...args: any) => unknown, opts?: {}): void {
    this.#assertOpen();
    this.api.create_function(
      this.db,
      name,
      fn.length,
      SQLITE_UTF8,
      0,
      (context: number, values: Uint32Array) => {
        const args: any[] = [];
        for (let i = 0; i < fn.length; ++i) {
          args.push(this.api.value(values[i]));
        }

        const r = fn(...args);
        if (r !== undefined) {
          this.api.result(context, r as SQLiteCompatibleType);
        }
      }
    );
  }

  onUpdate(
    cb: (
      type: UpdateType,
      dbName: string,
      tblName: string,
      rowid: bigint
    ) => void
  ): () => void {
    if (this.#updateHooks == null) {
      this.api.update_hook(this.db, this.#onUpdate);
      this.#updateHooks = new Set();
    }
    this.#updateHooks.add(cb);

    return () => this.#updateHooks?.delete(cb);
  }

  #onUpdate = (
    type: UpdateType,
    dbName: string,
    tblName: string,
    rowid: bigint
  ) => {
    if (this.#updateHooks == null) {
      return;
    }
    this.#updateHooks.forEach((h) => {
      // we wrap these since listeners can be thought of as separate threads of execution
      // one dieing shouldn't prevent others from being notified.
      try {
        h(type, dbName, tblName, rowid);
      } catch (e) {
        console.error("Failed notifying a DB update listener");
        console.error(e);
      }
    });
  };
}
