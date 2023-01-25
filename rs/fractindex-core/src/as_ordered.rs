use sqlite_nostd::{context, sqlite3, strlit, Connection, Context, ManagedStmt, ResultCode, Value};
extern crate alloc;
use alloc::format;
use alloc::vec::Vec;

pub fn as_ordered(
    context: *mut context,
    db: *mut sqlite3,
    table: &str,
    order_by_column: *mut sqlite_nostd::value,
    collection_columns: &[*mut sqlite_nostd::value],
) {
    // 1. ensure that all columns exist in the target table
    let mut collection_columns = collection_columns.to_vec();
    collection_columns.push(order_by_column);
    let rc = table_has_all_columns(db, table, &collection_columns);

    if rc.is_err() {
        context.result_error("Failed determining if all columns are present in the base table");
        return;
    }
    if let Ok(false) = rc {
        context.result_error("all columns are not present in the base table");
        return;
    }

    // 2. write into our __crsql_master table the information about the index
    if let Err(_) = db.exec_safe("SAVEPOINT record_schema_information;") {
        return;
    }
    let rc = record_schema_information(db, table, order_by_column, &collection_columns);
    if rc.is_err() {
        let _ = db.exec_safe("ROLLBACK;");
        context.result_error("Failed recording schema information for the base table");
        return;
    }

    // 3. set up triggers to allow for append and pre-pend operations
    if let Err(_) = create_append_prepend_triggers(db, table, order_by_column, &collection_columns)
    {
        let _ = db.exec_safe("ROLLBACK;");
        context.result_error("Failed creating triggers for the base table");
        return;
    }

    let _ = db.exec_safe("RELEASE;");
}

fn record_schema_information(
    db: *mut sqlite3,
    table: &str,
    order_by_column: *mut sqlite_nostd::value,
    collection_columns: &[*mut sqlite_nostd::value],
) -> Result<ResultCode, ResultCode> {
    // TODO: start a savepoint
    let sql = "INSERT OR REPLACE INTO __crsql_master (type, name, augments) VALUES (?, ?, ?, ?, ?) RETURNING id";
    let stmt = db.prepare_v2(sql)?;
    stmt.bind_text(1, "fract_index")?;
    stmt.bind_text(2, table)?;
    stmt.bind_text(3, table)?;
    stmt.step()?;

    let sql = "INSERT OR REPLACE INTO __crsql_master_prop (master_id, key, value) VALUES (?, 'order_by', ?)";
    // for each collection column, insert a row into __crsql_master_props

    // also insert a row to record the order_by_column

    // these rows will only be needed

    Ok(ResultCode::OK)
}

fn table_has_all_columns(
    db: *mut sqlite3,
    table: &str,
    columns: &Vec<*mut sqlite_nostd::value>,
) -> Result<bool, ResultCode> {
    let bindings = columns.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
    let sql = format!(
        "SELECT count(*) FROM pragma_table_info('{}') WHERE \"name\" in ({})",
        table.replace("'", "''"),
        bindings
    );
    let stmt = db.prepare_v2(&sql)?;
    for (i, col) in columns.iter().enumerate() {
        stmt.bind_value((i + 1) as i32, *col)?;
    }

    let step_code = stmt.step()?;
    if step_code == ResultCode::ROW {
        let count = stmt.column_int(0)?;
        if count != columns.len() as i32 {
            return Ok(false);
        }
    }

    Ok(true)
}

fn create_append_prepend_triggers(
    db: *mut sqlite3,
    table: &str,
    order_by_column: *mut sqlite_nostd::value,
    collection_columns: &[*mut sqlite_nostd::value],
) -> Result<ResultCode, ResultCode> {
    // post-insert trigger
    // WHEN order_by is 0 or 1, prepend or append.
    Ok(ResultCode::OK)
}

// prepend -- largely triggers
// move -- fn
// append -- largely triggers
