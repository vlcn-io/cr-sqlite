export type DELETE = 9;
export type INSERT = 18;
export type UPDATE = 23;
export type UpdateType = DELETE | INSERT | UPDATE;
export const UPDATE_TYPE: {
  readonly DELETE: DELETE;
  readonly INSERT: INSERT;
  readonly UPDATE: UPDATE;
} = {
  DELETE: 9,
  INSERT: 18,
  UPDATE: 23,
} as const;

export type DBID = string & {
  readonly DBID: unique symbol; // this is the phantom type
};

export type Schema = {
  namespace: string;
  name: string;
  active: boolean;
  content: string;
};

export interface DB {
  readonly siteid: string;
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
  ): () => void;
}

export type TMutex = {
  runExclusive<T>(cb: () => Promise<T> | T): Promise<T>;
  acquire(): Promise<() => void>;
  release(): void;
};

export interface TXAsync {
  readonly __mutex: TMutex;
  execMany(sql: string[]): Promise<void>;
  exec(sql: string, bind?: unknown[]): Promise<void>;
  execO<T extends {}>(sql: string, bind?: unknown[]): Promise<T[]>;
  execA<T extends any[]>(sql: string, bind?: unknown[]): Promise<T[]>;
  prepare(sql: string): Promise<StmtAsync>;
  tx(cb: (tx: TXAsync) => Promise<void>): Promise<void>;
  imperativeTx(): Promise<[() => void, TXAsync]>;
}

export interface DBAsync extends TXAsync {
  readonly siteid: string;
  readonly filename: string;
  close(): Promise<void>;
  onUpdate(
    cb: (
      type: UpdateType,
      dbName: string,
      tblName: string,
      rowid: bigint
    ) => void
  ): () => void;
  createFunction(name: string, fn: (...args: any) => unknown, opts?: {}): void;
}

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
  run(tx: TXAsync | null, ...bindArgs: any[]): Promise<void>;
  get(tx: TXAsync | null, ...bindArgs: any[]): Promise<any>;
  all(tx: TXAsync | null, ...bindArgs: any[]): Promise<any[]>;
  iterate<T>(tx: TXAsync | null, ...bindArgs: any[]): AsyncIterator<T>;
  raw(isRaw?: boolean): this;
  bind(args: readonly any[]): this;
  finalize(tx: TXAsync | null): Promise<void>;
}

export const version = 1;

export function cryb64(str: string, seed: number = 0) {
  let h1 = 0xdeadbeef ^ seed,
    h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  return 4294967296n * BigInt(h2) + BigInt(h1);
}

export function first<T>(data: T[]): T | undefined {
  if (!data) {
    return undefined;
  }
  return data[0];
}

export function firstPick<T>(data: any[]): T | undefined {
  const d = data[0];
  if (d == null) {
    return undefined;
  }

  return d[Object.keys(d)[0]];
}

export function pick<T extends any, R>(data: T[]): R[] {
  return data.map((d: any) => d[Object.keys(d)[0] as any]);
}
