export interface DB {
  execMany(sql: string[]): void;
  exec(sql: string, bind?: unknown | unknown[]): void;
  execO<T extends {}>(sql: string, bind?: unknown | unknown[]): T[];
  execA<T extends []>(sql: string, bind?: unknown | unknown[]): T[];

  prepare(sql: string): Stmt;
  close(): void;
  createFunction(name: string, fn: (...args: any) => unknown, opts?: {}): void;
  savepoint(cb: () => void): void;
  transaction(cb: () => void): void;
}

export interface Stmt {
  run(...bindArgs: any[]): void;
  get(...bindArgs: any[]): any;
  all(...bindArgs: any[]): any[];
  iterate(...bindArgs: any[]): Generator<any>;
  raw(isRaw?: boolean): this;
  bind(args: any[] | { [key: string]: any }): this;
  finalize(): void;
}

export const version = 1;
