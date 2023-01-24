use sqlite_nostd::{sqlite3, Connection, Value};

pub fn orderings(
    db: *mut sqlite3,
    after: *mut sqlite_nostd::value,
    after_column: &str,
    collection_id: *mut sqlite_nostd::value,
    collection_column: &str,
    table: &str,
    order_column: &str,
    collection_column: &str,
) {
}

pub fn as_ordered(
    db: *mut sqlite3,
    table: &str,
    ordering_column: &str,
    collection_columns: &[*mut sqlite_nostd::value],
) {
    // record some information about the table
    // we need a crsql_schema table
    // crsql_master to mimick sqlite?
}

// prepend -- largely triggers
// move -- fn
// append -- largely triggers
