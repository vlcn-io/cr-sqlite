import { DBAsync, StmtAsync, TXAsync } from "@vlcn.io/xplat-api";
import { computeCacheKey } from "./cache.js";
import { serialize } from "./serialize.js";
import * as SQLite from "@vlcn.io/wa-sqlite";
import TX from "./TX.js";

// TOOD: maybe lazily reset only if stmt is reused
export default class Stmt implements StmtAsync {
  // TOOD: use mode in get/all!
  private mode: "a" | "o" = "o";
  private finalized = false;
  private bindings: any[] = [];
  constructor(
    private originDB: TX,
    stmtFinalizer: Map<number, WeakRef<Stmt>>,
    // stmtFinalizationRegistry: FinalizationRegistry<number>,
    private cache: Map<string, Promise<any>>,
    private api: SQLiteAPI,
    private base: number,
    private str: number,
    private sql: string
  ) {
    stmtFinalizer.set(base, new WeakRef(this));
    // stmtFinalizationRegistry.register(this, base);
  }

  run(tx: DBAsync | null, ...bindArgs: any[]): Promise<any> {
    return serialize(
      this.cache,
      computeCacheKey(
        this.sql,
        this.mode,
        bindArgs.length > 0 ? bindArgs : this.bindings
      ),
      () => {
        bindArgs.length > 0 && this.bind(bindArgs);
        return this.api.step(this.base).then(() => this.api.reset(this.base));
      },
      tx?.__mutex || this.originDB.__mutex
    );
  }

  get(tx: DBAsync | null, ...bindArgs: any[]): Promise<any> {
    return serialize(
      this.cache,
      computeCacheKey(
        this.sql,
        this.mode,
        bindArgs.length > 0 ? bindArgs : this.bindings
      ),
      async () => {
        bindArgs.length > 0 && this.bind(bindArgs);
        let ret: any = null;
        let columnNames =
          this.mode === "o" ? this.api.column_names(this.base) : null;
        if ((await this.api.step(this.base)) == SQLite.SQLITE_ROW) {
          const row = this.api.row(this.base);
          if (columnNames != null) {
            const o: { [key: string]: any } = {};
            for (let i = 0; i < columnNames.length; ++i) {
              o[columnNames[i]] = row[i];
            }
            ret = o;
          } else {
            ret = row;
          }
        }
        await this.api.reset(this.base);
        return ret;
      },
      tx?.__mutex || this.originDB.__mutex
    );
  }

  all(tx: DBAsync | null, ...bindArgs: any[]): Promise<any[]> {
    return serialize(
      this.cache,
      computeCacheKey(
        this.sql,
        this.mode,
        bindArgs.length > 0 ? bindArgs : this.bindings
      ),
      async () => {
        bindArgs.length > 0 && this.bind(bindArgs);
        const ret: any[] = [];
        let columnNames =
          this.mode === "o" ? this.api.column_names(this.base) : null;
        while ((await this.api.step(this.base)) == SQLite.SQLITE_ROW) {
          if (columnNames != null) {
            const row: { [key: string]: any } = {};
            for (let i = 0; i < columnNames.length; ++i) {
              row[columnNames[i]] = this.api.column(this.base, i);
            }
            ret.push(row);
          } else {
            ret.push(this.api.row(this.base));
            continue;
          }
        }
        await this.api.reset(this.base);
        return ret;
      },
      tx?.__mutex || this.originDB.__mutex
    );
  }

  async *iterate<T>(tx: DBAsync | null, ...bindArgs: any[]): AsyncIterator<T> {
    this.bind(bindArgs);
    while (
      (await serialize(
        this.cache,
        undefined,
        () => this.api.step(this.base),
        tx?.__mutex || this.originDB.__mutex
      )) == SQLite.SQLITE_ROW
    ) {
      yield this.api.row(this.base) as any;
    }
    await serialize(
      this.cache,
      undefined,
      () => this.api.reset(this.base),
      tx?.__mutex || this.originDB.__mutex
    );
  }

  raw(isRaw?: boolean): this {
    if (isRaw) {
      this.mode = "a";
    } else {
      this.mode = "o";
    }

    return this;
  }

  bind(args: any[]): this {
    this.bindings = args;
    for (let i = 0; i < args.length; ++i) {
      this.api.bind(this.base, i + 1, args[i]);
    }
    return this;
  }

  /**
   * Release the resources associated with the prepared statement.
   * If you fail to call this it will automatically be called when the statement is garbage collected.
   */
  finalize(tx: TXAsync | null): Promise<void> {
    return serialize(
      this.cache,
      undefined,
      () => {
        if (this.finalized) return;
        this.finalized = true;
        this.api.str_finish(this.str);
        return this.api.finalize(this.base);
      },
      tx?.__mutex || this.originDB.__mutex
    );
  }
}
