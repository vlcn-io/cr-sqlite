import SQLiteAsyncESMFactory from "./wa-sqlite-async.js";
import * as SQLite from "wa-sqlite";
// @ts-ignore
import { IDBBatchAtomicVFS } from "wa-sqlite/src/examples/IDBBatchAtomicVFS.js";
import { DBAsync, StmtAsync } from "@vlcn.io/xplat-api";
import { SQLITE_UTF8 } from "wa-sqlite";

let api: SQLite3 | null = null;

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

export class DB implements DBAsync {
  constructor(public api: SQLiteAPI, public db: number) {}

  execMany(sql: string[]): Promise<any> {
    return this.api.exec(this.db, sql.join(""));
  }

  exec(sql: string, bind?: unknown[]): Promise<void> {
    return this.statements(sql, false, bind);
  }

  execO<T extends {}>(sql: string, bind?: unknown[]): Promise<T[]> {
    return this.statements(sql, true, bind);
  }

  execA<T extends any[]>(sql: string, bind?: unknown[]): Promise<T[]> {
    return this.statements(sql, false, bind);
  }

  async prepare(sql: string): Promise<StmtAsync> {
    const str = this.api.str_new(this.db, sql);
    const prepared = await this.api.prepare_v2(this.db, str);
    if (prepared == null) {
      this.api.str_finish(str);
      throw new Error(`Could not prepare ${sql}`);
    }

    return new Stmt(this.api, prepared.stmt, str);
  }

  close(): Promise<any> {
    return this.api.close(this.db);
  }

  createFunction(name: string, fn: (...args: any) => unknown, opts?: {}): void {
    this.api.create_function(
      this.db,
      name,
      fn.arguments.length,
      SQLITE_UTF8,
      0,
      (context: number, values: Uint32Array) => {
        const args: any[] = [];
        for (let i = 0; i < fn.arguments.length; ++i) {
          args.push(this.api.value(values[i]));
        }

        const r = fn(...args);
        this.api.result(context, r as SQLiteCompatibleType);
      }
    );
  }

  async savepoint(cb: () => Promise<void>): Promise<void> {
    await this.exec("SAVPOINT");
    await cb();
  }

  async transaction(cb: () => Promise<void>): Promise<void> {
    // TODO: track if in tx. . . but this is async so . . you know . . .
    await this.exec("BEGIN");
    try {
      await cb();
    } catch (e) {
      await this.exec("ROLLBACK");
      return;
    }
    await this.exec("COMMIT");
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
  private mode: "col" | "obj" = "obj";
  constructor(
    private api: SQLiteAPI,
    private base: number,
    private str: number
  ) {}

  run(...bindArgs: any[]): Promise<any> {
    this.bind(bindArgs);

    return this.api.step(this.base).then(() => this.api.reset(this.base));
  }

  async get(...bindArgs: any[]): Promise<any> {
    this.bind(bindArgs);
    let ret: any = null;
    if ((await this.api.step(this.base)) == SQLite.SQLITE_ROW) {
      ret = this.api.row(this.base);
    }
    await this.api.reset(this.base);
    return ret;
  }

  async all(...bindArgs: any[]): Promise<any[]> {
    this.bind(bindArgs);
    const ret: any[] = [];
    while ((await this.api.step(this.base)) == SQLite.SQLITE_ROW) {
      ret.push(this.api.row(this.base));
    }
    await this.api.reset(this.base);
    return ret;
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
      this.mode = "col";
    } else {
      this.mode = "obj";
    }

    return this;
  }

  bind(args: any[]): this {
    for (let i = 0; i < args.length; ++i) {
      this.api.bind(this.base, i, args[i]);
    }
    return this;
  }

  finalize(): void {
    this.api.str_finish(this.str);
    this.api.finalize(this.base);
  }
}

export default async function initWasm(): Promise<SQLite3> {
  if (api != null) {
    return api;
  }

  const module = await SQLiteAsyncESMFactory({
    locateFile(file: string) {
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
