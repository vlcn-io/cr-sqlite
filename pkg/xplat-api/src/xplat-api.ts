export interface DB {
  execMany(sql: string[]): void;
  exec(sql: string, bind?: unknown[]): void;
  execO<T extends {}>(sql: string, bind?: unknown[]): T[];
  execA<T extends any[]>(sql: string, bind?: unknown[]): T[];

  prepare(sql: string): Stmt;
  close(): void;
  createFunction(name: string, fn: (...args: any) => unknown, opts?: {}): void;
  savepoint(cb: () => void): void;
  transaction(cb: () => void): void;
}

export type DBAsync = {
  [K in keyof Omit<
    DB,
    "prepare" | "transaction" | "savepoint" | "createFunction"
  >]: (...args: Parameters<DB[K]>) => Promise<ReturnType<DB[K]>>;
} & {
  prepare(sql: string): Promise<StmtAsync>;
  transaction(cb: () => Promise<void>): Promise<void>;
  savepoint(cb: () => Promise<void>): Promise<void>;
  createFunction(name: string, fn: (...args: any) => unknown, opts?: {}): void;
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
