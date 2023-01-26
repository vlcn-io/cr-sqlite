use sqlite_nostd::{sqlite3, Connection, ResultCode, Value};
extern crate alloc;
use alloc::format;
use alloc::vec::Vec;

use crate::util::{extract_columns, extract_pk_columns};

pub fn create_fract_view_and_triggers(
    db: *mut sqlite3,
    table: &str,
    order_by_column: *mut sqlite_nostd::value,
    collection_columns: &[*mut sqlite_nostd::value],
) -> Result<ResultCode, ResultCode> {
    // extract pk information from pragma table_info
    let pks = extract_pk_columns(db, table)?;

    let after_pk_defs = pks
        .iter()
        .map(|pk| format!("NULL AS \"after_{}\"", pk.text().replace("\"", "\"\"")))
        .collect::<Vec<_>>()
        .join(", ");

    let sql = format!(
        "CREATE VIEW IF NOT EXISTS {table}_fractindex AS
        SELECT *, {after_pk_defs}
        FROM {table}",
        table = table,
        after_pk_defs = after_pk_defs
    );

    db.exec_safe(&sql)?;

    craete_instead_of_insert_trigger(db, table, order_by_column, collection_columns)?;
    create_instead_of_update_trigger()?;

    Ok(ResultCode::OK)
}

fn craete_instead_of_insert_trigger(
    db: *mut sqlite3,
    table: &str,
    order_by_column: *mut sqlite_nostd::value,
    collection_columns: &[*mut sqlite_nostd::value],
) -> Result<ResultCode, ResultCode> {
    let columns = extract_columns(db, table)?;
    let pks = extract_pk_columns(db, table)?;
    let columns_ex_order = columns
        .iter()
        .filter(|col| col.text() != order_by_column.text())
        .collect::<Vec<_>>();

    let col_names_ex_order = columns_ex_order
        .iter()
        .map(|col| format!("\"{}\"", col.text().replace("\"", "\"\"")))
        .collect::<Vec<_>>()
        .join(", ");

    let col_values_ex_order = columns_ex_order
        .iter()
        .map(|col| format!("NEW.\"{}\"", col.text().replace("\"", "\"\"")))
        .collect::<Vec<_>>()
        .join(", ");

    // after pk names are just all the pks prefixed with after_
    let after_pk_names_as_args = pks
        .iter()
        .map(|pk| format!("'after_{}'", pk.text().replace("'", "''")))
        .collect::<Vec<_>>()
        .join(", ");

    let collection_column_names_as_args = collection_columns
        .iter()
        .map(|col| format!("'{}'", col.text().replace("'", "''")))
        .collect::<Vec<_>>()
        .join(", ");

    let after_pk_values = pks
        .iter()
        .map(|pk| format!("NEW.\"after_{}\"", pk.text().replace("\"", "\"\"")))
        .collect::<Vec<_>>()
        .join(", ");

    let sql = format!(
        "CREATE TRIGGER IF NOT EXISTS \"{table}_fractindex_insert_trig\"
        INSTEAD OF INSERT ON \"{table}_fractindex\"
        BEGIN
            INSERT INTO \"{table}\"
              ({col_names_ex_order}, \"{order_col}\")
            VALUES
              ({col_values_ex_order}, crsql_fract_shift_insert(
                '{table_arg}',
                {collection_column_names_as_args},
                -1,
                {after_pk_names_as_args},
                {after_pk_values}
              ));
        END;",
        table = table.replace("\"", "\"\""),
        table_arg = table.replace("'", "''"),
        col_names_ex_order = col_names_ex_order,
        col_values_ex_order = col_values_ex_order,
        order_col = order_by_column.text().replace("\"", "\"\""),
        after_pk_names_as_args = after_pk_names_as_args,
        after_pk_values = after_pk_values,
        collection_column_names_as_args = collection_column_names_as_args,
    );
    db.exec_safe(&sql)

    /*
     * Instead of calling into a new function can you select from an udpate
     * that is returning?
     *
     * SELECT crsql_ordering(
     *  tbl, order_by_column, collection_columns
     * )
     *
     * ^-- we need a way to access crsql_table_info from this extension.
     *
     * Ok keep to fract_shift_insert and maintain a prepared statement
     * for this extension that pulls collection columns.
     *
     * Keeps this extension independent as fract indexing doesn't
     * need the other crdt functionality.
     */
}

fn create_instead_of_update_trigger() -> Result<ResultCode, ResultCode> {
    Ok(ResultCode::OK)
}

pub fn fract_shift_insert(
    db: *mut sqlite3,
    table: &str,
    collection_columns: &[*mut sqlite_nostd::value],
    pk_names: &[*mut sqlite_nostd::value],
    pk_values: &[*mut sqlite_nostd::value],
) -> Result<ResultCode, ResultCode> {
    return Ok(ResultCode::OK);
}

/*
 * Persisted without needing SQL?
 * Post-facto relational based on SQLite4 LSM tree?
 */
