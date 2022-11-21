/**
 * Provides an interface to an instance of SQLite running in a different worker
 * that is the same as the interface when SQLite is running in the same
 * thread as the caller.
 *
 */
import * as Comlink from "comlink";

import { DBAsync, StmtAsync } from "@vlcn.io/xplat-api";
import { Remote } from "comlink";
import { API } from "./comlinkable";
import "./transfer-handlers";

export class SQLite3 {
  public readonly worker: Remote<API>;

  static async create(
    urls: {
      wasmUrl: string;
      proxyUrl: string;
    },
    worker: Worker
  ): Promise<SQLite3> {
    const comlinked = Comlink.wrap<API>(worker);
    return new Promise((resolve, reject) => {
      comlinked.onReady(
        urls,
        Comlink.proxy(() => {
          resolve(new SQLite3(worker));
        }),
        Comlink.proxy(reject)
      );
    });
  }

  private constructor(worker: Worker) {
    this.worker = Comlink.wrap<API>(worker);
  }

  open(filename?: string, mode: string = "c"): Promise<DB> {
    return this.worker
      .open(filename, mode)
      .then((dbid) => new DB(this.worker, dbid));
  }
}

export class DB implements DBAsync {
  constructor(private worker: Remote<API>, private dbid: number) {}

  execMany(sql: string[]): Promise<void> {
    return this.worker.execMany(this.dbid, sql);
  }

  exec(sql: string, bind?: unknown[] | undefined): Promise<void> {
    return this.worker.exec(this.dbid, sql, bind);
  }

  execO<T extends {}>(sql: string, bind?: unknown[] | undefined): Promise<T[]> {
    return this.worker.execO(this.dbid, sql, bind) as any;
  }

  execA<T extends any[]>(
    sql: string,
    bind?: unknown[] | undefined
  ): Promise<T[]> {
    return this.worker.execA(this.dbid, sql, bind) as any;
  }

  close(): void {
    this.worker.close(this.dbid);
  }

  prepare(sql: string): Promise<StmtAsync> {
    return this.worker
      .prepare(this.dbid, sql)
      .then((stmtid) => new Stmt(this.worker, stmtid));
  }

  createFunction(
    name: string,
    fn: (...args: any) => unknown,
    opts?: {} | undefined
  ): void {
    throw new Error(
      "functions should be registered on the worker thread and not outside of it for perf reasons"
    );
  }

  savepoint(cb: () => void): Promise<void> {
    throw new Error("unimplemented");
  }

  transaction(cb: () => void): Promise<void> {
    // TODO: use STM primitives
    // call our cb ourselves rather than passing to worker via comlink proxy
    throw new Error("unimplemented");
  }
}

class Stmt implements StmtAsync {
  private bound: any[] | null = null;
  private mode: "o" | "a" = "o";

  constructor(private worker: Remote<API>, private stmtid: number) {}

  run(...bindArgs: any[]): Promise<void> {
    if (this.bound != null && bindArgs.length === 0) {
      bindArgs = this.bound;
    }
    this.bound = null;

    return this.worker.stmtRun(this.stmtid, bindArgs);
  }

  get(...bindArgs: any[]): Promise<any> {
    if (this.bound != null && bindArgs.length === 0) {
      bindArgs = this.bound;
    }
    this.bound = null;

    return this.worker.stmtGet(this.stmtid, this.mode, bindArgs).then(() => {});
  }

  all(...bindArgs: any[]): Promise<any[]> {
    if (this.bound != null && bindArgs.length === 0) {
      bindArgs = this.bound;
    }
    this.bound = null;

    return this.worker.stmtGet(this.stmtid, this.mode, bindArgs);
  }

  iterate<T>(...bindArgs: any[]): AsyncIterator<T, any, undefined> {
    if (this.bound != null && bindArgs.length === 0) {
      bindArgs = this.bound;
    }
    this.bound = null;

    return this.worker.stmtIterate(this.stmtid, this.mode, bindArgs) as any;
  }

  raw(isRaw?: boolean | undefined): this {
    if (isRaw) {
      this.mode = "a";
    } else {
      this.mode = "o";
    }

    return this;
  }

  bind(args: any[]): this {
    this.bound = args;
    return this;
  }

  finalize(): Promise<number> {
    return this.worker.stmtFinalize(this.stmtid) as Promise<any>;
  }
}
