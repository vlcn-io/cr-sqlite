import {
  DBAsync,
  StmtAsync,
  UPDATE_TYPE,
  UpdateType,
  TXAsync,
} from "@vlcn.io/xplat-api";
import LiveQuery from "./LiveQuery";

// wraps a normal DB in a reactive version
// We need to:
// 1. be able to hand out live queries
// 2. track mutations
// 3. cache live queries for later re-use

export default class RxDB implements DBAsync {
  #trackedQueries: Map<LiveQuery<any, any>, readonly string[]> = new Map();
  #queriesByTable: Map<string, Set<LiveQuery<any, any>>> = new Map();

  // add a live query to track
  // - tables used
  // - query string
  // - bind params
  trackLiveQuery(query: LiveQuery<any, any>, queriedTables: readonly string[]) {
    // see if was previously tracked and remove if so.
    this.#cleanTableToQueryTracking(query, queriedTables);

    // return a disposer to untrack this live query
    this.#trackedQueries.set(query, queriedTables);
    this.#addQueryToTableTracking(query, queriedTables);

    // 1. parse the query string
    // 2. extract constraints (where conditions)

    return () => {
      this.#trackedQueries.delete(query);
      this.#cleanTableToQueryTracking(query, queriedTables);
    };
  }

  #cleanTableToQueryTracking(query: LiveQuery<any, any>, queriedTables: readonly string[]) {
    // remove from table to query map
    for (const table of queriedTables) {
      const queries = this.#queriesByTable.get(table);
      if (queries) {
        queries.delete(query);
      }
    }
  }

  #addQueryToTableTracking(query: LiveQuery<any, any>, queriedTables: readonly string[]) {
    // add to table to query map
    for (const table of queriedTables) {
      let queries = this.#queriesByTable.get(table);
      if (!queries) {
        queries = new Set();
        this.#queriesByTable.set(table, queries);
      }
      queries.add(query);
    }
  }

  #processWrite(query: string, bindings: readonly any[]) {
    // 1. parse the query string
    // 2. extract constraints (where conditions)
    // 3. check if any tracked query is affected
    // 4. if so, emit update
    //
    
  }

  // we need to modify exec statements to catch mutations

  // need to collect exec statements that are in a transaction
  // and emit post commit
}
