import { DBAsync } from "@vlcn.io/xplat-api";
import { Mutex } from "async-mutex";

export default class TX implements DBAsync {
  constructor(private readonly db: DBAsync, public readonly __mutex: Mutex) {}

  get siteid(): string {
    return this.db.siteid;
  }

  execMany(sql: string[]): Promise<void> {}
  exec(sql: string, bind?: unknown[]): Promise<void> {}
  execO<T extends {}>(sql: string, bind?: unknown[]): Promise<T[]> {}
  execA<T extends any[]>(sql: string, bind?: unknown[]): Promise<T[]> {}
  close(): Promise<void> {}

  onUpdate(
    cb: (
      type: UpdateType,
      dbName: string,
      tblName: string,
      rowid: bigint
    ) => void
  ): () => void {}

  prepare(sql: string): Promise<StmtAsync> {}

  createFunction(
    name: string,
    fn: (...args: any) => unknown,
    opts?: {}
  ): void {}

  savepoint(cb: () => Promise<void>): Promise<void> {}

  transaction(cb: (tx: DBAsync) => Promise<void>): Promise<void> {}
}
