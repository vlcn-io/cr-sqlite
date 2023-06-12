import { StmtAsync, TXAsync } from "@vlcn.io/xplat-api";
import { Mutex } from "async-mutex";
import { computeCacheKey } from "./cache.js";
import { serialize, serializeTx } from "./serialize.js";
import Stmt from "./Stmt.js";
import * as SQLite from "@vlcn.io/wa-sqlite";

export default class TX implements TXAsync {
  private cache = new Map<string, Promise<any>>();

  constructor(
    public api: SQLiteAPI,
    public db: number,
    public readonly __mutex: Mutex,
    public readonly assertOpen: () => void,
    public readonly stmtFinalizer: Map<number, WeakRef<Stmt>>
  ) {}

  execMany(sql: string[]): Promise<void> {
    this.assertOpen();
    return serialize(
      this.cache,
      null,
      () => this.api.exec(this.db, sql.join("")),
      this.__mutex
    );
  }

  exec(sql: string, bind?: SQLiteCompatibleType[]): Promise<void> {
    this.assertOpen();
    return serialize(
      this.cache,
      computeCacheKey(sql, "a", bind),
      () => {
        return this.statements(sql, false, bind);
      },
      this.__mutex
    );
  }
  execO<T extends {}>(
    sql: string,
    bind?: SQLiteCompatibleType[]
  ): Promise<T[]> {
    this.assertOpen();
    return serialize(
      this.cache,
      computeCacheKey(sql, "o", bind),
      () => this.statements(sql, true, bind),
      this.__mutex
    );
  }

  execA<T extends any[]>(
    sql: string,
    bind?: SQLiteCompatibleType[]
  ): Promise<T[]> {
    this.assertOpen();
    return serialize(
      this.cache,
      computeCacheKey(sql, "a", bind),
      () => this.statements(sql, false, bind),
      this.__mutex
    );
  }

  prepare(sql: string): Promise<StmtAsync> {
    this.assertOpen();
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

  tx(cb: (tx: TXAsync) => Promise<void>): Promise<void> {
    this.assertOpen();
    return serializeTx(
      async (tx: TXAsync) => {
        await tx.exec("SAVEPOINT crsql_transaction");
        try {
          await cb(tx);
        } catch (e) {
          await tx.exec("ROLLBACK");
          throw e;
        }
        await tx.exec("RELEASE crsql_transaction");
      },
      this.__mutex,
      this
    );
  }

  imperativeTx(): Promise<[() => void, TXAsync]> {
    return this.__mutex.acquire().then((release) => {
      const subMutex = new Mutex();
      return [
        release,
        new TX(
          this.api,
          this.db,
          subMutex,
          this.assertOpen,
          this.stmtFinalizer
        ),
      ];
    });
  }

  private async statements(
    sql: string,
    retObjects: boolean,
    bind?: unknown[]
  ): Promise<any> {
    const results: { columns: string[]; rows: any[] }[] = [];

    const str = this.api.str_new(this.db, sql);
    let prepared: { stmt: number | null; sql: number } | null = {
      stmt: null,
      sql: this.api.str_value(str),
    };
    try {
      while ((prepared = await this.api.prepare_v2(this.db, prepared.sql))) {
        const stmt = prepared.stmt!;

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

        this.api.finalize(prepared.stmt!);
        prepared.stmt = null;
      }
    } finally {
      if (prepared?.stmt) {
        this.api.finalize(prepared.stmt);
      }
      this.api.str_finish(str);
    }
    // catch (error) {
    //   console.error(`Failed running ${sql}`, error);
    //   throw error;
    // }

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
