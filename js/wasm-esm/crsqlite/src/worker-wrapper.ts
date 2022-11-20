/**
 * Provides an interface to an instance of SQLite running in a different worker
 * that is the same as the interface when SQLite is running in the same
 * thread as the caller.
 *
 */

import {
  DB as IDB,
  DBAsync,
  Stmt as IStmt,
  StmtAsync,
} from "@vlcn.io/xplat-api";
import { Remote } from "comlink";
import { API } from "./comlinkable";

export class SQLite3 {
  constructor(public readonly worker: Remote<API>) {}

  open(filename?: string, mode: string = "c") {
    const dbid = this.worker.open(filename, mode);
    return new DB(this.worker, dbid);
  }
}

export class DB implements DBAsync {
  constructor(private worker: Remote<API>, private dbid: number) {}

  execMany(sql: string[]): void {
    this.worker.execMany(this.dbid, sql);
  }

  exec(sql: string, bind?: unknown[] | undefined): void {
    this.worker.exec(this.dbid, sql, bind);
  }

  execO<T extends {}>(sql: string, bind?: unknown[] | undefined): T[] {
    // TODO: run `execA` and then conver to json objects in main thread.
    // don't convert to json objects in the worker.
    return this.worker.execO(this.dbid, sql, bind);
  }

  execA<T extends any[]>(sql: string, bind?: unknown[] | undefined): T[] {
    return this.worker.execA(this.dbid, sql, bind);
  }

  close(): void {
    this.worker.close(this.dbid);
  }

  prepare(sql: string): IStmt {
    const stmtid = this.worker.prepare(this.dbid, sql);
    return new Stmt(this.dbid, stmtid);
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

  savepoint(cb: () => void): void {}

  transaction(cb: () => void): void {
    // TODO: use STM primitives
    // call our cb ourselves rather than passing to worker via comlink proxy
  }
}

class Stmt implements StmtAsync {
  constructor(private dbid: number, private stmtid: number) {}

  run(...bindArgs: any[]): Promise<void> {}

  get(...bindArgs: any[]): Promise<any> {}

  iterate<T>(...bindArgs: any[]): AsyncIterator<T, any, undefined> {}

  raw(isRaw?: boolean | undefined): this {}

  bind(args: any[]): this {}

  finalize(): void {}
}
