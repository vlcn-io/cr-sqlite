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
