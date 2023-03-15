/**
 *
 */
export type QueryAST = {};

export function queryToAST(query: string): QueryAST {
  return {};
}

export function astToQuery(ast: QueryAST): string {
  return "";
}

/**
 * - Coalescing duplicate queries into 1
 * - Adding a query cache
 * - Collecting all read queries across many micro-tasks into the same
 * indexeddb read transaction
 * - Folding many calls to the same `useQuery` into a single query against the DB
 *
 * To realize implementing a fully reactive query system is actually
 * not that hard.
 */
