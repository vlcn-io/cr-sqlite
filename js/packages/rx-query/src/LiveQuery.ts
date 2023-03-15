import { DBAsync, StmtAsync, TXAsync } from "@vlcn.io/xplat-api";
import RxDB from "./RxDB.js";

// Globally pending live queries.
// This is used for when _many_ live queries attempt to fetch at the same time.
// When this happens, we collect them all into the same read transaction
// as this is wayyy more performant than issuing independent read transactions.
let pendingQuery: number | null = null;
let queryTxHolder: number | null = null;
let queryId = 0;
let txAcquisition: Promise<[() => void, TXAsync]> | null = null;

const log = (...args: any) => {};

export type QueryData<T> = {
  readonly loading: boolean;
  readonly error?: Error;
  readonly data: T;
};

const EMPTY_ARRAY: readonly any[] = Object.freeze([]);

/**
 * Represents a query that can be subscribed to.
 *
 * For convenience, supports updating the bind params and query string.
 *
 * Bind params makes sense.. but why query string? Lengthy explination
 */
export default class LiveQuery<T, M = readonly T[]> {
  /**
   * Currently in-flight fetch if there is one.
   */
  private pendingFetchPromise: Promise<any> | null = null;
  /**
   * Currently in-flight statement preparation if there is one.
   * Pending fetches are chained after pending prepares given the statement must be
   * prepared before it can be fetched.
   */
  private pendingPreparePromise: Promise<StmtAsync | null> | null = null;
  /**
   * The statement to run.
   */
  private stmt: StmtAsync | null = null;
  /**
   * The tables that are being queried by the statement. Resolves through views.
   */
  public queriedTables: string[] | null = null;
  /**
   * The currently cached set of data returned by this live query.
   */
  private data: QueryData<M> | null = null;
  /**
   * The subscriber to this live query.
   */
  private reactInternals: null | (() => void) = null;
  /**
   * Cached error case if one exists
   */
  private error?: QueryData<M>;
  /**
   * If this live query has been disposed. We save this state so we can
   * properly shut down in-flight requests when they complete.
   */
  private disposed: boolean = false;
  /**
   * Cached state for when the live query is disposed.
   */
  private readonly disposedState;
  /**
   * Cached state for when the live query is fetching.
   */
  private fetchingState;
  /**
   * Unsubscribe the live query from the database so we stop receiving
   * updates.
   */
  private dbSubscriptionDisposer: (() => void) | null;
  /**
   * If the live query wanted to update itself while it was already fetching
   * then this will be true. Once the in-flight fetch completes a new fetch
   * will be initiated and `queuedFetch` will be false.
   *
   * This mechanisms prevents any backing up of live queries.
   *
   * If a live query is invoked a million times while it is still
   * fetching, those will all get folded into a single fetch.
   */
  private queuedFetch = false;
  /**
   * If the queued fetch needs to update bind parameters
   */
  private queuedFetchRebind = false;

  constructor(
    private db: RxDB,
    public query: string,
    public bindings: readonly any[] | undefined,
    private postProcess?: (rows: T[]) => M
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
      loading: true,
      error: undefined,
    };
  }

  /**
   * Subscribe someone to this live query.
   * Currently we only support 1 subscriber to a live query.
   */
  subscribeReactInternals = (internals: () => void): (() => void) => {
    this.reactInternals = internals;
    return this.#disposeDbSubscription;
  };

  #disposeDbSubscription = () => {
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
  public processWrite = () => {
    if (this.disposed) {
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
        this.#disposeDbSubscription();

        this.dbSubscriptionDisposer = this.db.trackLiveQuery(
          this,
          queriedTables
        );
        // TODO: here we need to subscribe to rxdb.
        // Pass it our tables used and our query
        // then it can call us to tell us to:
        // 1. re-query
        // 2. apply the change to our local cache of the data

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

              this.data = {
                loading: false,
                data: (this.postProcess ? this.postProcess(data) : data) as any,
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
        txAcquisition = this.db.imperativeTx().then((relAndTx) => {
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
      this.db.prepare(this.query),
      usedTables(this.db, this.query),
    ]);
  }

  dispose() {
    this.disposed = true;
    this.stmt?.finalize(null);
    this.stmt = null;
    this.#disposeDbSubscription();
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
