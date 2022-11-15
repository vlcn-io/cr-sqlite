import SQLiteAsyncESMFactory from "@vlcn.io/wa-sqlite/dist/wa-sqlite-async.mjs";
import * as SQLite from "@vlcn.io/wa-sqlite";
// @ts-ignore
import { IDBBatchAtomicVFS } from "@vlcn.io/wa-sqlite/src/examples/IDBBatchAtomicVFS.js";
import { DBAsync, StmtAsync } from "@vlcn.io/xplat-api";
import { SQLITE_UTF8 } from "@vlcn.io/wa-sqlite";

let api: SQLite3 | null = null;
type SQLiteAPI = ReturnType<typeof SQLite.Factory>;

let queue: Promise<any> = Promise.resolve();
let txQueue: Promise<any> = Promise.resolve();

const isDebug = (globalThis as any).__vlcn_wa_crsqlite_dbg;
function log(...data: any[]) {
  if (isDebug) {
    console.log("wa-crsqlite: ", ...data);
  }
}

/**
 * Although wa-sqlite exposes an async interface, hitting
 * it concurrently deadlocks it.
 *
 * It is only to be used sequentially.
 *
 * Serialize enforces that, nomatter what the callers of us do.
 *
 * null clears cache. Use for writes.
 * string gets from cache.
 * undefined has no impact on cache and does not check cache.
 */
const cache = new Map<string, Promise<any>>();
function serialize(key: string | null | undefined, cb: () => any) {
  // if is write, drop cache and don't use cache
  // TODO: test me. Useful for Strut where all slides query against deck and such things.
  // TODO: when we no longer have to serialize calls we should use `graphql/DataLoader` infra
  if (key === null) {
    log("Cache clear");
    cache.clear();
  } else if (key !== undefined) {
    const existing = cache.get(key);
    if (existing) {
      log("Cache hit", key);
      return existing;
    }
  }

  log("Enqueueing query ", key);
  const res = queue.then(
    () => cb(),
    (e) => {
      console.error(e);
    }
  );
  queue = res;

  if (key) {
    cache.set(key, res);
  }

  return res;
}

function serializeTx(cb: () => any) {
  const res = txQueue.then(
    () => cb(),
    (e) => {
      console.error(e);
    }
  );
  txQueue = res;

  return res;
}

export class SQLite3 {
  constructor(private base: SQLiteAPI) {}

  open(filename?: string, mode: string = "c") {
    return this.base
      .open_v2(
        filename || ":memory:",
        SQLite.SQLITE_OPEN_CREATE |
          SQLite.SQLITE_OPEN_READWRITE |
          SQLite.SQLITE_OPEN_URI,
        filename != null ? "idb-batch-atomic" : undefined
      )
      .then((db) => new DB(this.base, db));
  }
}

const re = /insert\s|update\s|delete\s/;
function computeCacheKey(
  sql: string,
  mode: "o" | "a",
  bind?: SQLiteCompatibleType[]
) {
  const lower = sql.toLowerCase();

  // is it a write?
  if (re.exec(lower) != null) {
    log("received write");
    return null;
  }

  if (bind != null) {
    return (
      lower +
      "|" +
      mode +
      "|" +
      bind.map((b) => (b != null ? b.toString() : "null")).join("|")
    );
  }
  return lower;
}

export class DB implements DBAsync {
  constructor(public api: SQLiteAPI, public db: number) {}

  execMany(sql: string[]): Promise<any> {
    return serialize(null, () => this.api.exec(this.db, sql.join("")));
  }

  exec(sql: string, bind?: SQLiteCompatibleType[]): Promise<void> {
    // TODO: either? since not returning?
    return serialize(computeCacheKey(sql, "a", bind), () =>
      this.statements(sql, false, bind)
    );
  }

  execO<T extends {}>(
    sql: string,
    bind?: SQLiteCompatibleType[]
  ): Promise<T[]> {
    return serialize(computeCacheKey(sql, "o", bind), () =>
      this.statements(sql, true, bind)
    );
  }

  execA<T extends any[]>(
    sql: string,
    bind?: SQLiteCompatibleType[]
  ): Promise<T[]> {
    return serialize(computeCacheKey(sql, "a", bind), () =>
      this.statements(sql, false, bind)
    );
  }

  prepare(sql: string): Promise<StmtAsync> {
    return serialize(undefined, async () => {
      const str = this.api.str_new(this.db, sql);
      const prepared = await this.api.prepare_v2(
        this.db,
        this.api.str_value(str)
      );
      if (prepared == null) {
        this.api.str_finish(str);
        throw new Error(`Could not prepare ${sql}`);
      }

      return new Stmt(this.api, prepared.stmt, str, sql);
    });
  }

  close(): Promise<any> {
    return serialize(undefined, () => this.api.close(this.db));
  }

  createFunction(name: string, fn: (...args: any) => unknown, opts?: {}): void {
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
    await this.exec("SAVPOINT");
    await cb();
  }

  transaction(cb: () => Promise<void>): Promise<void> {
    return serializeTx(async () => {
      await this.exec("BEGIN");
      try {
        await cb();
      } catch (e) {
        await this.exec("ROLLBACK");
        return;
      }
      await this.exec("COMMIT");
    });
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

    if (results.length > 1) {
      throw new Error("We currently only support 1 statement per query.");
    }
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

// TOOD: maybe lazily reset only if stmt is reused
class Stmt implements StmtAsync {
  // TOOD: use mode in get/all!
  private mode: "a" | "o" = "o";
  constructor(
    private api: SQLiteAPI,
    private base: number,
    private str: number,
    private sql: string
  ) {}

  run(...bindArgs: any[]): Promise<any> {
    return serialize(computeCacheKey(this.sql, this.mode, bindArgs), () => {
      this.bind(bindArgs);

      return this.api.step(this.base).then(() => this.api.reset(this.base));
    });
  }

  get(...bindArgs: any[]): Promise<any> {
    return serialize(
      computeCacheKey(this.sql, this.mode, bindArgs),
      async () => {
        this.bind(bindArgs);
        let ret: any = null;
        if ((await this.api.step(this.base)) == SQLite.SQLITE_ROW) {
          ret = this.api.row(this.base);
        }
        await this.api.reset(this.base);
        return ret;
      }
    );
  }

  all(...bindArgs: any[]): Promise<any[]> {
    return serialize(
      computeCacheKey(this.sql, this.mode, bindArgs),
      async () => {
        this.bind(bindArgs);
        const ret: any[] = [];
        while ((await this.api.step(this.base)) == SQLite.SQLITE_ROW) {
          ret.push(this.api.row(this.base));
        }
        await this.api.reset(this.base);
        return ret;
      }
    );
  }

  async *iterate<T>(...bindArgs: any[]): AsyncIterator<T> {
    this.bind(bindArgs);
    while ((await this.api.step(this.base)) == SQLite.SQLITE_ROW) {
      yield this.api.row(this.base) as any;
    }
    await this.api.reset(this.base);
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
    for (let i = 0; i < args.length; ++i) {
      this.api.bind(this.base, i + 1, args[i]);
    }
    return this;
  }

  finalize(): void {
    this.api.str_finish(this.str);
    this.api.finalize(this.base);
  }
}

export default async function initWasm(
  locateWasm?: (file: string) => string
): Promise<SQLite3> {
  if (api != null) {
    return api;
  }

  const module = await SQLiteAsyncESMFactory({
    locateFile(file: string) {
      if (locateWasm) {
        return locateWasm(file);
      }
      return new URL(file, import.meta.url).href;
    },
  });
  const sqlite3 = SQLite.Factory(module);
  sqlite3.vfs_register(
    new IDBBatchAtomicVFS("idb-batch-atomic", { durability: "relaxed" })
  );

  api = new SQLite3(sqlite3);
  return api;
}
