// do this as a aphrodite style query plan?

// we know we've already matched on a table
// now we need to run the query against the specific row.
//
// If it is an insert, we have all values
// If it is an update, we need to use the caced values to flesh out the row
// If it is a delete, see if it exists in the cache for the query
//
// certain queries need to be totally re-run. Need to identify those.
//

/**
 * we need to run the query against the specific row.
 * we need to encode the query then as something runnable.
 *
 * You wrote a thing that compiles to SQL, why not reverse it?
 *
 * Pull:
 * - wheres
 * - limits
 * - orders
 * - groups
 * - joins
 *
 * Create a query plan like you have for aphrodite.
 */

/**
 * How shall we match queries?
 * If the query would select our row.
 *
 * Non join case:
 * Just run the predicates against the row
 *
 * Join case:
 * Single hop?
 * Run the predicates for the row's table against the row.
 * If match, re-run query.
 *
 * Maybe also check the query cache for rows that match the join.
 * Well the correct columns would need to be selected in that case.
 *
 * SELECT contact.name, profilepic.uri FROM contacts JOIN profilepics ON contacts.profilepic_id = profilepics.id
 *
 * - An insert to contact would re-run the query for 1 row from profilepics.
 * - An insert to profielpic would re-run the query for 1 row from contacts.
 *
 * We can keep a cache of relations. Well those cols would need selecting.
 *
 * Updates that do not change any selected or compared against columns are no-ops.
 */
