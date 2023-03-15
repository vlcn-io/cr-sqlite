/**
 * Queries need to be re-written to ensure every queried table
 * returns its rowid.
 *
 * This helps us to materialize joins into the relation cache.
 * We need joins materialized so when a row, or set of rows in a tx,
 * are written we can create the joined representation of those rows
 * in-memory.
 *
 * This joined representation is then used to find the queries (which were
 * doing the joins in the first place) that need updating.
 *
 * What shall we do about aggregate queries?
 * Just not support them for now.
 * And re-run any time a row for their table is written
 * for which we overlap on the constraint.
 *
 * So they have some support.
 *
 * How shall we handle `OR`?
 * If any of those constraints match, we go for it.
 *
 * We can skip constraint matching approach to start and just map
 * from relation -> queries and re-run all queries for that relation
 * against _this single reconstructed row_.
 *
 * Eventually optimize by indexing the query constraints.
 */
export function rewriteQuery(query: string): QueryAST {
  return query;
}

/**
 * Query examples to re-write:
 *
 * SELECT * FROM slide WHERE deck_id = ?;
 * SELECT id FROM slide;
 * SELECT * FROM slide WHERE id = ?;
 * SELECT * FROM slide WHERE update_time > ? AND create_time < ?;
 */

/**
 * Any tables in `from` we need rowids for (handle if they alias the from).
 * Any tables in `join` conditions we need rowids for.
 *
 * Can we re-write to Aphrodite style expressions?
 *
 * We would need to when it comes time to evaluate the query against the single row.
 */
