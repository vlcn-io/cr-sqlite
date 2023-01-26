extern crate alloc;
use alloc::format;
use alloc::string::String;
use alloc::vec::Vec;
use sqlite_nostd::Value;
use sqlite_nostd::{self, Connection, ResultCode};

pub fn where_predicates(columns: &[*mut sqlite_nostd::value]) -> Result<String, ResultCode> {
    let mut predicates = String::new();
    for (i, column) in columns.iter().enumerate() {
        let column_name = column.text();
        predicates.push_str(&format!("\"{}\" = NEW.\"{}\"", column_name, column_name));
        if i < columns.len() - 1 {
            predicates.push_str(" AND ");
        }
    }
    if columns.len() == 0 {
        predicates.push_str("1");
    }
    Ok(predicates)
}

pub fn collection_min_select(
    table: &str,
    order_by_column: *mut sqlite_nostd::value,
    collection_columns: &[*mut sqlite_nostd::value],
) -> Result<String, ResultCode> {
    Ok(format!(
        "SELECT MIN(\"{}\") FROM \"{}\" WHERE {}",
        order_by_column.text(),
        table,
        where_predicates(collection_columns)?
    ))
}

pub fn collection_max_select(
    table: &str,
    order_by_column: *mut sqlite_nostd::value,
    collection_columns: &[*mut sqlite_nostd::value],
) -> Result<String, ResultCode> {
    Ok(format!(
        "SELECT MAX(\"{}\") FROM \"{}\" WHERE {}",
        order_by_column.text(),
        table,
        where_predicates(collection_columns)?
    ))
}

pub fn extract_pk_columns(
    db: *mut sqlite_nostd::sqlite3,
    table: &str,
) -> Result<Vec<*mut sqlite_nostd::value>, ResultCode> {
    let sql = "SELECT \"name\" FROM pragma_table_info(?) WHERE \"pk\" > 0 ORDER BY \"pk\" ASC";
    let stmt = db.prepare_v2(&sql)?;
    stmt.bind_text(1, table)?;
    let mut columns = Vec::new();
    while stmt.step()? == ResultCode::ROW {
        columns.push(stmt.column_value(0)?);
    }
    Ok(columns)
}

pub fn extract_columns(
    db: *mut sqlite_nostd::sqlite3,
    table: &str,
) -> Result<Vec<*mut sqlite_nostd::value>, ResultCode> {
    let sql = "SELECT \"name\" FROM pragma_table_info(?)";
    let stmt = db.prepare_v2(&sql)?;
    stmt.bind_text(1, table)?;
    let mut columns = Vec::new();
    while stmt.step()? == ResultCode::ROW {
        columns.push(stmt.column_value(0)?);
    }
    Ok(columns)
}

pub fn escape_ident(ident: &str) -> String {
    return ident.replace("\"", "\"\"");
}
