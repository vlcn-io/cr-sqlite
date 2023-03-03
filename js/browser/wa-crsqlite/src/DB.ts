import * as SQLite from "@vlcn.io/wa-sqlite";
import { DBAsync, StmtAsync, UpdateType } from "@vlcn.io/xplat-api";
import { SQLITE_UTF8 } from "@vlcn.io/wa-sqlite";
import { serialize, serializeTx, topLevelMutex } from "./serialize.js";
import Stmt from "./Stmt.js";
import { computeCacheKey } from "./cache.js";

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

  constructor(public api: SQLiteAPI, public db: number) {}

  get siteid(): string {
    return this.#siteid!;
  }

  _setSiteid(siteid: string) {
    if (this.#siteid) {
      throw new Error("Site id already set");
    }
    this.#siteid = siteid;
  }

  execMany(sql: string[]): Promise<any> {
    return serialize(
      this.cache,
      null,
      () => this.api.exec(this.db, sql.join("")),
      this.__mutex
    );
  }

  exec(sql: string, bind?: SQLiteCompatibleType[]): Promise<void> {
    // TODO: either? since not returning?
    this.#assertOpen();
    return serialize(
      this.cache,
      computeCacheKey(sql, "a", bind),
      () => {
        return this.statements(sql, false, bind);
      },
      this.__mutex
    );
  }

  #assertOpen() {
    if (this.#closed) {
      throw new Error("The DB is closed");
    }
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

  /**
   * @returns returns an object for each row, e.g. `{ col1: valA, col2: valB, ... }`
   */
  execO<T extends {}>(
    sql: string,
    bind?: SQLiteCompatibleType[]
  ): Promise<T[]> {
    this.#assertOpen();
    return serialize(
      this.cache,
      computeCacheKey(sql, "o", bind),
      () => this.statements(sql, true, bind),
      this.__mutex
    );
  }

  /**
   * @returns returns an array for each row, e.g. `[ valA, valB, ... ]`
   */
  execA<T extends any[]>(
    sql: string,
    bind?: SQLiteCompatibleType[]
  ): Promise<T[]> {
    this.#assertOpen();
    return serialize(
      this.cache,
      computeCacheKey(sql, "a", bind),
      () => this.statements(sql, false, bind),
      this.__mutex
    );
  }

  prepare(sql: string): Promise<StmtAsync> {
    this.#assertOpen();
    return serialize(
      this.cache,
      undefined,
      async () => {
        const str = this.api.str_new(this.db, sql);
        const prepared = await this.api.prepare_v2(
          this.db,
          this.api.str_value(str)
        );
        if (prepared == null) {
          this.api.str_finish(str);
          throw new Error(`Could not prepare ${sql}`);
        }

        return new Stmt(
          this,
          this.stmtFinalizer,
          // this.stmtFinalizationRegistry,
          this.cache,
          this.api,
          prepared.stmt,
          str,
          sql
        );
      },
      this.__mutex
    );
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

  async savepoint(cb: () => Promise<void>): Promise<void> {
    throw new Error("do not use me yet");
    this.#assertOpen();
    await this.exec("SAVEPOINT");
    await cb();
  }

  transaction(cb: (tx: DBAsync) => Promise<void>): Promise<void> {
    this.#assertOpen();
    return serializeTx(
      async (tx: DBAsync) => {
        await this.exec("SAVEPOINT crsql_transaction");
        try {
          await cb(tx);
        } catch (e) {
          await this.exec("ROLLBACK");
          return;
        }
        await this.exec("RELEASE crsql_transaction");
      },
      this.__mutex,
      this
    );
  }

  private async statements(
    sql: string,
    retObjects: boolean,
    bind?: unknown[]
  ): Promise<any> {
    const results: { columns: string[]; rows: any[] }[] = [];

    for await (const stmt of this.api.statements(this.db, sql)) {
      const rows: any[] = [];
      const columns = this.api.column_names(stmt);
      if (bind) {
        this.bind(stmt, bind);
      }
      while ((await this.api.step(stmt)) === SQLite.SQLITE_ROW) {
        const row = this.api.row(stmt);
        rows.push(row);
      }
      if (columns.length) {
        results.push({ columns, rows });
      }
    }

    // we'll only return results for first stmt
    // if (results.length > 1) {
    //   throw new Error("We currently only support 1 statement per query.");
    // }
    const returning = results[0];
    if (returning == null) return null;

    if (!retObjects) {
      return returning.rows;
    }

    const objects: Object[] = [];
    for (const row of returning.rows) {
      const o: { [key: string]: any } = {};
      for (let i = 0; i < returning.columns.length; ++i) {
        o[returning.columns[i]] = row[i];
      }
      objects.push(o);
    }

    return objects;
  }

  private bind(stmt: number, values: unknown[]) {
    for (let i = 0; i < values.length; ++i) {
      const v = values[i];
      this.api.bind(
        stmt,
        i + 1,
        typeof v === "boolean" ? (v && 1) || 0 : (v as any)
      );
    }
  }
}
