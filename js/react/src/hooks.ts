import { useEffect, useRef, useSyncExternalStore } from "react";
import { TblRx } from "@vlcn.io/rx-tbl";
import { DBAsync, StmtAsync } from "@vlcn.io/xplat-api";

export type QueryData<T> = {
  readonly loading: boolean;
  readonly error?: Error;
  readonly data: readonly T[];
};

export type CtxAsync = {
  readonly db: DBAsync;
  readonly rx: TblRx;
};

const EMPTY_ARRAY: readonly any[] = Object.freeze([]);
const FETCHING: QueryData<any> = Object.freeze({
  loading: true,
  data: EMPTY_ARRAY,
});

// TODO: two useQuery variants?
// ony for async db and one for sync db?

// const log = console.log.bind(console);
const log = (...args: any) => {};

export function useAsyncQuery<T extends {}>(
  ctx: CtxAsync,
  query: string,
  bindings?: []
): QueryData<T> {
  const stateMachine = useRef<AsyncResultStateMachine<T> | null>(null);
  if (stateMachine.current == null) {
    stateMachine.current = new AsyncResultStateMachine(ctx, query, bindings);
  }

  useEffect(
    () => () => {
      stateMachine.current?.dispose();
    },
    []
  );
  useEffect(() => {
    stateMachine.current?.respondToBindingsChange(bindings || EMPTY_ARRAY);
  }, bindings || EMPTY_ARRAY);
  useEffect(() => {
    stateMachine.current?.respondToQueryChange(query);
  }, [query]);

  return useSyncExternalStore<QueryData<T>>(
    stateMachine.current.subscribeReactInternals,
    stateMachine.current.getSnapshot
  );
}

class AsyncResultStateMachine<T extends {}> {
  private pendingFetchPromise: Promise<any> | null = null;
  private pendingPreparePromise: Promise<StmtAsync | null> | null = null;
  private stmt: StmtAsync | null = null;
  private queriedTables: string[] | null = null;
  private data: QueryData<T> | null = null;
  private reactInternals: null | (() => void) = null;
  private error?: QueryData<T>;
  private disposed: boolean = false;

  constructor(
    private ctx: CtxAsync,
    private query: string,
    private bindings: readonly any[] | undefined
  ) {}

  subscribeReactInternals = (internals: () => void): (() => void) => {
    this.reactInternals = internals;
    return this.ctx.rx.on(this.respondToDatabaseChange);
  };

  respondToQueryChange = (query: string): void => {
    if (this.disposed) {
      return;
    }
    this.query = query;
    // cancel prep and fetch if in-flight
    this.pendingPreparePromise = null;
    this.pendingFetchPromise = null;
    this.queriedTables = null;
    this.error = undefined;
    this.data = null;
    this.getSnapshot(true);
  };

  respondToBindingsChange = (bindings: readonly any[]): void => {
    if (this.disposed) {
      return;
    }
    this.bindings = bindings;
    // cancel fetch if in-flight. We do not need to re-prepare for binding changes.
    this.pendingFetchPromise = null;
    this.error = undefined;
    this.data = null;
    this.getSnapshot(true);
  };

  private respondToDatabaseChange = (changedTbls: Set<string> | null) => {
    if (this.disposed) {
      return;
    }
    if (changedTbls != null) {
      if (
        this.queriedTables == null ||
        !this.queriedTables.some((t) => changedTbls.has(t))
      ) {
        return;
      }
    }

    this.pendingFetchPromise = null;
    this.error = undefined;
    this.data = null;
    this.getSnapshot();
  };

  /**
   * The entrypoint to the state machine.
   * Any time something happens (db change, query change, bindings change) we call back
   * into `getSnapshot` to compute what the new state should be.
   *
   * getSnapshot must be memoized and not re-issue queries if one is already in flight for
   * the current set of:
   * - query string
   * - bindings
   * - underlying db state
   */
  getSnapshot = (rebind: boolean = false): QueryData<T> => {
    log("get snapshot");
    if (this.disposed) {
      log("disposed");
      return {
        loading: false,
        data: EMPTY_ARRAY,
        error: new Error("useAsyncQuery was disposed"),
      };
    }
    if (this.data != null) {
      log("data");
      return this.data;
    }
    if (this.error != null) {
      log("error");
      return this.error;
    }

    if (this.pendingPreparePromise == null) {
      // start preparing the statement
      this.prepare();
    }
    if (this.pendingFetchPromise == null) {
      // start fetching the data
      this.fetch(rebind);
    }

    log("fetching");
    return FETCHING;
  };

  private prepare() {
    log("hooks - Preparing");
    this.queriedTables = null;
    this.error = undefined;
    this.data = null;
    this.pendingFetchPromise = null;
    if (this.stmt) {
      this.stmt.finalize();
    }
    this.stmt = null;

    const preparePromise = this.prepareAndGetUsedTables().then(
      ([stmt, queriedTables]) => {
        // Someone called in with a new query before we finished preparing the original query
        if (this.pendingPreparePromise !== preparePromise) {
          stmt.finalize();
          return null;
        }

        this.stmt = stmt;
        this.queriedTables = queriedTables;
        return stmt;
      }
    );
    this.pendingPreparePromise = preparePromise;
  }

  private fetch(rebind: boolean) {
    log("hooks - Fetching");
    this.error = undefined;
    this.data = null;

    let fetchPromise: Promise<any> | null = null;

    const fetchInternal = () => {
      log("hooks - Fetching (internal)");
      if (fetchPromise != null && this.pendingFetchPromise !== fetchPromise) {
        return;
      }
      const stmt = this.stmt;
      if (stmt == null) {
        return;
      }

      if (rebind) {
        stmt.bind(this.bindings || []);
      }

      fetchPromise = stmt
        .raw(false)
        .all()
        .then(
          (data) => {
            if (this.pendingFetchPromise !== fetchPromise) {
              return;
            }

            this.data = {
              loading: false,
              data,
              error: undefined,
            };
            this.reactInternals!();
          },
          (error: Error) => {
            this.error = {
              loading: false,
              data: this.data?.data || EMPTY_ARRAY,
              error,
            };
            this.reactInternals!();
          }
        );
      this.pendingFetchPromise = fetchPromise;
      return fetchPromise;
    };

    if (this.stmt == null) {
      // chain after prepare promise
      fetchPromise = this.pendingPreparePromise!.then((stmt) => {
        if (stmt == null) {
          return;
        }

        return fetchInternal();
      });
      this.pendingFetchPromise = fetchPromise;
    } else {
      fetchInternal();
      return;
    }
  }

  private prepareAndGetUsedTables(): Promise<[StmtAsync, string[]]> {
    return Promise.all([
      this.ctx.db.prepare(this.query),
      usedTables(this.ctx.db, this.query),
    ]);
  }

  dispose() {
    this.disposed = true;
    this.stmt?.finalize();
    this.stmt = null;
    this.ctx.rx.off(this.respondToDatabaseChange);
  }
}

function usedTables(db: DBAsync, query: string): Promise<string[]> {
  return db
    .execA(
      `SELECT name FROM tables_used('${query.replaceAll(
        "'",
        "''"
      )}') WHERE type = 'table' AND schema = 'main';`
    )
    .then((rows) => {
      return rows.map((r) => r[0]);
    });
}
