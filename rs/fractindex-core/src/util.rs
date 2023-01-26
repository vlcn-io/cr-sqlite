extern crate alloc;
use alloc::format;
use alloc::string::String;
use sqlite_nostd::Value;
use sqlite_nostd::{self, ResultCode};

pub fn where_predicates(columns: &[*mut sqlite_nostd::value]) -> Result<String, ResultCode> {
    let mut predicates = String::new();
    for (i, column) in columns.iter().enumerate() {
        let column_name = column.text();
        predicates.push_str(&format!("\"{}\" = NEW.\"{}\"", column_name, column_name));
        if i < columns.len() - 1 {
            predicates.push_str(" AND ");
        }
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
