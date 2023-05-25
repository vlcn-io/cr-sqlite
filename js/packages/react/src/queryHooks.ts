import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  DBAsync,
  StmtAsync,
  UPDATE_TYPE,
  UpdateType,
  TXAsync,
} from "@vlcn.io/xplat-api";
export { first, firstPick, pick } from "@vlcn.io/xplat-api";
import { CtxAsync } from "./context.js";
import { RowID } from "./rowid.js";

export type QueryData<T> = {
  readonly loading: boolean;
  readonly error?: Error;
  readonly data: T;
};

const EMPTY_ARRAY: readonly any[] = Object.freeze([]);

// TODO: two useQuery variants?
// one for async db and one for sync db?

// const log = console.log.bind(console);
const log = (...args: any) => {};

export type SQL<R> = string;

const allUpdateTypes = [
  UPDATE_TYPE.INSERT,
  UPDATE_TYPE.UPDATE,
  UPDATE_TYPE.DELETE,
];

export function usePointQuery<R, M = R>(
  ctx: CtxAsync,
  _rowid_: RowID<R>,
  query: SQL<R>,
  bindings?: any[],
  postProcess?: (rows: R[]) => M
): QueryData<M> {
  return useQuery(
    ctx,
    query,
    bindings,
    postProcess,
    [UPDATE_TYPE.UPDATE, UPDATE_TYPE.DELETE],
    _rowid_
  );
}

export function useRangeQuery<R, M = R[]>(
  ctx: CtxAsync,
  query: SQL<R>,
  bindings?: any[],
  postProcess?: (rows: R[]) => M
) {
  return useQuery(ctx, query, bindings, postProcess, [
    UPDATE_TYPE.INSERT,
    UPDATE_TYPE.DELETE,
  ]);
}

export function useQuery<R, M = R[]>(
  ctx: CtxAsync,
  query: SQL<R>,
  bindings?: any[],
  postProcess?: (rows: R[]) => M,
  updateTypes: UpdateType[] = allUpdateTypes,
  _rowid_?: RowID<R>
): QueryData<M> {
  const stateMachine = useRef<AsyncResultStateMachine<R, M> | null>(null);
  const lastCtx = useRef<CtxAsync | null>(ctx);
  // A bunch of hoops to jump through to appease react strict mode
  if (stateMachine.current == null || lastCtx.current !== ctx) {
    lastCtx.current = ctx;
    if (stateMachine.current != null) {
      stateMachine.current.dispose();
    }
    stateMachine.current = new AsyncResultStateMachine(
      ctx,
      query,
      bindings,
      postProcess,
      updateTypes,
      _rowid_
    );
  }

  useEffect(() => {
    return () => {
      stateMachine.current?.dispose();
      stateMachine.current = null;
    };
  }, []);
  useEffect(
    () => {
      stateMachine.current?.respondToBindingsChange(bindings || EMPTY_ARRAY);
    },
    _rowid_ == null
      ? bindings || EMPTY_ARRAY
      : [...(bindings || EMPTY_ARRAY), _rowid_]
  );
  useEffect(() => {
    stateMachine.current?.respondToQueryChange(query);
  }, [query]);

  return useSyncExternalStore<QueryData<M>>(
    stateMachine.current.subscribeReactInternals,
    stateMachine.current.getSnapshot
  );
}

let pendingQuery: number | null = null;
let queryTxHolder: number | null = null;
let queryId = 0;
let txAcquisition: Promise<[() => void, TXAsync]> | null = null;

class AsyncResultStateMachine<T, M = readonly T[]> {
  private pendingFetchPromise: Promise<any> | null = null;
  private pendingPreparePromise: Promise<StmtAsync | null> | null = null;
  private stmt: StmtAsync | null = null;
  private queriedTables: string[] | null = null;
  private data: QueryData<M> | null = null;
  private reactInternals: null | (() => void) = null;
  private error?: QueryData<M>;
  private disposed: boolean = false;
  private readonly disposedState;
  private fetchingState;
  private dbSubscriptionDisposer: (() => void) | null;
  // So a query hook cannot overwhelm the DB, we fold all the queries
  // down and only execute the last one.
  private queuedFetch = false;
  private queuedFetchRebind = false;

  constructor(
    private ctx: CtxAsync,
    private query: string,
    private bindings: readonly any[] | undefined,
    private postProcess?: (rows: T[]) => M,
    private updateTypes: UpdateType[] = allUpdateTypes,
    private _rowid_?: bigint
  ) {
    this.dbSubscriptionDisposer = null;
    this.disposedState = {
      loading: false,
      data: this.postProcess
        ? this.postProcess(EMPTY_ARRAY as any)
        : (EMPTY_ARRAY as any),
      error: new Error("useAsyncQuery was disposed"),
    } as const;
    this.fetchingState = {
      ...this.disposedState,
      rawData: [] as any[],
      loading: true,
      error: undefined,
    };
  }

  subscribeReactInternals = (internals: () => void): (() => void) => {
    this.reactInternals = internals;
    return this.disposeDbSubscription;
  };

  disposeDbSubscription = () => {
    if (this.dbSubscriptionDisposer) {
      this.dbSubscriptionDisposer();
      this.dbSubscriptionDisposer = null;
    }
  };

  // TODO: warn the user if query changes too much
  respondToQueryChange = (query: string): void => {
    if (this.disposed) {
      return;
    }
    if (this.query === query) {
      return;
    }
    this.query = query;
    // cancel prep and fetch if in-flight
    this.queuedFetch = this.queuedFetch || this.pendingFetchPromise != null;
    this.pendingPreparePromise = null;
    this.pendingFetchPromise = null;
    this.queriedTables = null;
    this.error = undefined;
    this.data = null;
    this.pullData(true);
  };

  // TODO: warn the user if bindings change too much
  respondToBindingsChange = (bindings: readonly any[]): void => {
    if (this.disposed) {
      return;
    }
    let i = 0;
    for (i = 0; i < bindings.length; ++i) {
      if (bindings[i] !== this.bindings?.[i]) {
        break;
      }
    }
    if (i === bindings.length && i === this.bindings?.length) {
      // no actual change
      return;
    }
    this.bindings = bindings;
    // cancel fetch if in-flight. We do not need to re-prepare for binding changes.
    this.queuedFetch = this.queuedFetch || this.pendingFetchPromise != null;
    if (this.queuedFetch) {
      this.queuedFetchRebind = true;
    }

    this.pendingFetchPromise = null;
    this.error = undefined;
    this.data = null;
    this.pullData(true);
  };

  // TODO: the change event should be forwarded too.
  // So we can subscribe to adds vs deletes vs updates vs all
  private respondToDatabaseChange = (updates: UpdateType[]) => {
    if (this.disposed) {
      this.disposeDbSubscription();
      return;
    }

    if (!updates.some((u) => this.updateTypes.includes(u))) {
      return;
    }

    this.queuedFetch = this.queuedFetch || this.pendingFetchPromise != null;
    this.pendingFetchPromise = null;
    this.error = undefined;
    if (this.data != null) {
      this.fetchingState = {
        ...this.data,
        loading: true,
      } as any;
    }
    this.data = null;
    this.pullData(false);
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
  getSnapshot = (rebind: boolean = false): QueryData<M> => {
    log("get snapshot");
    if (this.disposed) {
      log("disposed");
      return this.disposedState;
    }
    if (this.data != null) {
      log("data");
      return this.data;
    }
    if (this.error != null) {
      log("error");
      return this.error;
    }

    this.pullData(rebind);

    log("fetching");
    return this.fetchingState;
  };

  private pullData(rebind: boolean) {
    if (this.disposed) {
      return;
    }

    if (this.queuedFetch) {
      return;
    }

    if (this.pendingPreparePromise == null) {
      // start preparing the statement
      this.prepare();
    }
    if (this.pendingFetchPromise == null) {
      // start fetching the data
      this.fetch(rebind);
    }
  }

  private prepare() {
    log("hooks - Preparing");
    this.queriedTables = null;
    this.error = undefined;
    this.data = null;
    this.pendingFetchPromise = null;
    if (this.stmt) {
      this.stmt.finalize(null);
    }
    this.stmt = null;

    const preparePromise = this.prepareAndGetUsedTables().then(
      ([stmt, queriedTables]) => {
        // Someone called in with a new query before we finished preparing the original query
        if (this.pendingPreparePromise !== preparePromise) {
          stmt.finalize(null);
          return null;
        }

        this.stmt = stmt;
        this.queriedTables = queriedTables;
        this.disposeDbSubscription();
        if (this._rowid_ != null) {
          if (this.queriedTables.length > 1) {
            console.warn("usePointQuery should only be used on a single table");
          }
          this.dbSubscriptionDisposer = this.ctx.rx.onPoint(
            this.queriedTables[0],
            this._rowid_,
            this.respondToDatabaseChange
          );
        } else {
          this.dbSubscriptionDisposer = this.ctx.rx.onRange(
            queriedTables,
            this.respondToDatabaseChange
          );
        }
        return stmt;
      }
    );
    this.pendingPreparePromise = preparePromise;
  }

  private fetch(rebind: boolean) {
    log("hooks - Fetching");
    if (this.stmt == null) {
      rebind = true;
    }
    this.error = undefined;
    this.data = null;

    let fetchPromise: Promise<any> | null = null;

    const fetchInternal = () => {
      log("hooks - Fetching (internal)");
      if (fetchPromise != null && this.pendingFetchPromise !== fetchPromise) {
        if (this.queuedFetch) {
          this.queuedFetch = false;
          this.pullData(false);
        }
        return;
      }
      const stmt = this.stmt;
      if (stmt == null) {
        return;
      }

      if (rebind || this.queuedFetchRebind) {
        stmt.bind(this.bindings || []);
        this.queuedFetchRebind = false;
      }

      const doFetch = (releaser: () => void, tx: TXAsync) => {
        return stmt
          .raw(false)
          .all(tx)
          .then(
            (data) => {
              if (pendingQuery === myQueryId) {
                pendingQuery = null;
                txAcquisition = null;
                tx.exec("RELEASE use_query_" + queryTxHolder).then(
                  releaser,
                  releaser
                );
              }

              if (this.pendingFetchPromise !== fetchPromise) {
                this.queuedFetch = false;
                if (this.pendingFetchPromise == null) {
                  this.pullData(false);
                }
                return;
              }

              let newRawData = data;
              let newData;
              const oldRawData = this.fetchingState?.rawData;
              if (dataShallowlyEqual(newRawData, oldRawData)) {
                newRawData = oldRawData;
                newData = this.fetchingState?.data;
              } else {
                newData = this.postProcess
                  ? this.postProcess(newRawData)
                  : newRawData;
              }
              this.data = {
                loading: false,
                data: newData,
                // @ts-ignore
                rawData: newRawData,
                error: undefined,
              };
              this.pendingFetchPromise = null;

              if (this.queuedFetch) {
                this.queuedFetch = false;
                this.pullData(false);
              } else {
                this.reactInternals && this.reactInternals();
              }
            },
            (error: Error) => {
              if (pendingQuery === myQueryId) {
                pendingQuery = null;
                // rollback tx
                tx.exec("ROLLBACK").then(releaser, releaser);
              }
              this.error = {
                loading: false,
                data:
                  this.data?.data ||
                  ((this.postProcess
                    ? this.postProcess(EMPTY_ARRAY as any)
                    : EMPTY_ARRAY) as any),
                error,
              };
              this.pendingFetchPromise = null;
              if (this.queuedFetch) {
                this.queuedFetch = false;
                this.pullData(false);
              } else {
                this.reactInternals && this.reactInternals!();
              }
            }
          );
      };

      const myQueryId = ++queryId;
      const prevPending = pendingQuery;
      pendingQuery = myQueryId;
      if (prevPending == null) {
        queryTxHolder = myQueryId;
        // start tx
        txAcquisition = this.ctx.db.imperativeTx().then((relAndTx) => {
          relAndTx[1].exec("SAVEPOINT use_query_" + queryTxHolder);
          return relAndTx;
        });
      }
      fetchPromise = txAcquisition!.then(([releaser, tx]) =>
        doFetch(releaser, tx)
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
    this.stmt?.finalize(null);
    this.stmt = null;
    this.disposeDbSubscription();
    this.disposed = true;
  }
}

function usedTables(db: DBAsync, query: string): Promise<string[]> {
  return db
    .execA(
      `SELECT tbl_name FROM tables_used('${query.replaceAll(
        "'",
        "''"
      )}') AS u JOIN sqlite_master ON sqlite_master.name = u.name WHERE u.schema = 'main';`
    )
    .then((rows) => {
      return rows.map((r) => r[0]);
    });
}

function dataShallowlyEqual(left: any, right: any): boolean {
  // Handle arrays of rows
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) {
      return false;
    }
    for (let i = 0; i < left.length; i++) {
      if (left[i] !== right[i] && !shallowEqual(left[i], right[i])) {
        return false;
      }
    }
    return true;
  }

  // Anything else
  return shallowEqual(left, right);
}

const is = Object.is;
const hasOwn = Object.prototype.hasOwnProperty;

export default function shallowEqual(objA: any, objB: any) {
  if (is(objA, objB)) return true;

  if (
    typeof objA !== "object" ||
    objA === null ||
    typeof objB !== "object" ||
    objB === null
  ) {
    return false;
  }

  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);

  if (keysA.length !== keysB.length) return false;

  for (let i = 0; i < keysA.length; i++) {
    if (!hasOwn.call(objB, keysA[i]) || !is(objA[keysA[i]], objB[keysA[i]])) {
      return false;
    }
  }

  return true;
}
