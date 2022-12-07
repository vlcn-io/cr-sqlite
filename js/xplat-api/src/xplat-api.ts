export type UpdateType = 9 | 18 | 23;
export const updateType = {
  DELETE: 9,
  INSERT: 18,
  UPDATE: 23,
};

export interface DB {
  execMany(sql: string[]): void;
  exec(sql: string, bind?: unknown[]): void;
  execO<T extends {}>(sql: string, bind?: unknown[]): T[];
  execA<T extends any[]>(sql: string, bind?: unknown[]): T[];
  close(): void;

  prepare(sql: string): Stmt;
  createFunction(name: string, fn: (...args: any) => unknown, opts?: {}): void;
  savepoint(cb: () => void): void;
  transaction(cb: () => void): void;
  onUpdate(
    cb: (
      type: UpdateType,
      dbName: string,
      tblName: string,
      rowid: bigint
    ) => void
  ): void;
}

export type DBAsync = {
  execMany(sql: string[]): Promise<void>;
  exec(sql: string, bind?: unknown[]): Promise<void>;
  execO<T extends {}>(sql: string, bind?: unknown[]): Promise<T[]>;
  execA<T extends any[]>(sql: string, bind?: unknown[]): Promise<T[]>;
  close(): void;
  onUpdate(
    cb: (
      type: UpdateType,
      dbName: string,
      tblName: string,
      rowid: bigint
    ) => void
  ): void;

  prepare(sql: string): Promise<StmtAsync>;
  createFunction(name: string, fn: (...args: any) => unknown, opts?: {}): void;
  savepoint(cb: () => Promise<void>): Promise<void>;
  transaction(cb: () => Promise<void>): Promise<void>;
};

export interface Stmt {
  run(...bindArgs: any[]): void;
  get(...bindArgs: any[]): any;
  all(...bindArgs: any[]): any[];
  iterate<T>(...bindArgs: any[]): Iterator<T>;
  raw(isRaw?: boolean): this;
  bind(args: any[]): this;
  finalize(): void;
}

export interface StmtAsync {
  run(...bindArgs: any[]): Promise<void>;
  get(...bindArgs: any[]): Promise<any>;
  all(...bindArgs: any[]): Promise<any[]>;
  iterate<T>(...bindArgs: any[]): AsyncIterator<T>;
  raw(isRaw?: boolean): this;
  bind(args: any[]): this;
  finalize(): void;
}

export const version = 1;
