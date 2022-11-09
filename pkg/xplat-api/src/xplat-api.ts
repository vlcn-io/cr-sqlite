export interface DB {
  execMany(sql: string[]): void;
  exec(sql: string, bind?: unknown | unknown[]): void;
  execO<T extends {}>(sql: string, bind?: unknown | unknown[]): T[];
  execA<T extends any[]>(sql: string, bind?: unknown | unknown[]): T[];

  prepare(sql: string): Stmt;
  close(): void;
  createFunction(name: string, fn: (...args: any) => unknown, opts?: {}): void;
  savepoint(cb: () => void): void;
  transaction(cb: () => void): void;
}

export type DBAsync = {
  [K in keyof Omit<DB, "prepare">]: (
    ...args: Parameters<DB[K]>
  ) => Promise<ReturnType<DB[K]>>;
} & {
  prepare(sql: string): Promise<StmtAsync>;
};

export interface Stmt {
  run(...bindArgs: any[]): void;
  get(...bindArgs: any[]): any;
  all(...bindArgs: any[]): any[];
  iterate<T>(...bindArgs: any[]): Generator<T>;
  raw(isRaw?: boolean): this;
  bind(args: any[] | { [key: string]: any }): this;
  finalize(): void;
}

export type StmtAsync = {
  [K in keyof Omit<Stmt, "iterate">]: (
    ...args: Parameters<Stmt[K]>
  ) => Promise<ReturnType<Stmt[K]>>;
} & {
  iterate<T>(...bindArgs: any[]): AsyncGenerator<T>;
};

export const version = 1;
