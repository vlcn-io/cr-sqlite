/*
 * Copyright 2023 One Law LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
#![cfg_attr(not(test), no_std)]
use sqlite_nostd::{sqlite3, Connection, Destructor, ManagedStmt, ResultCode};
extern crate alloc;
use alloc::format;
use alloc::string::String;
use alloc::vec::Vec;

/**
 * Backfills rows in a table with clock values.
 */
pub fn backfill_table(
    db: *mut sqlite3,
    table: &str,
    pk_cols: Vec<&str>,
    non_pk_cols: Vec<&str>,
) -> Result<ResultCode, ResultCode> {
    db.exec_safe("SAVEPOINT backfill")?;

    let sql = format!(
      "SELECT {pk_cols} FROM \"{table}\" as t1
        LEFT JOIN \"{table}__crsql_clock\" as t2 ON {pk_on_conditions} WHERE t2.\"{first_pk}\" IS NULL",
      table = escape_ident(table),
      pk_cols = pk_cols
          .iter()
          .map(|f| format!("t1.\"{}\"", escape_ident(f)))
          .collect::<Vec<_>>()
          .join(", "),
      pk_on_conditions = pk_cols
          .iter()
          .map(|f| format!("t1.\"{}\" = t2.\"{}\"", escape_ident(f), escape_ident(f)))
          .collect::<Vec<_>>()
          .join(" AND "),
      first_pk = escape_ident(pk_cols[0]),
    );
    let stmt = db.prepare_v2(&sql);

    let result = match stmt {
        Ok(stmt) => create_clock_rows_from_stmt(stmt, db, table, pk_cols, non_pk_cols),
        Err(e) => Err(e),
    };

    if let Err(e) = result {
        db.exec_safe("ROLLBACK TO backfill")?;
        return Err(e);
    }

    Ok(ResultCode::OK)
}

fn create_clock_rows_from_stmt(
    read_stmt: ManagedStmt,
    db: *mut sqlite3,
    table: &str,
    pk_cols: Vec<&str>,
    non_pk_cols: Vec<&str>,
) -> Result<ResultCode, ResultCode> {
    let write_stmt = db.prepare_v2(&format!(
        "INSERT INTO \"{table}__crsql_clock\"
          ({pk_cols}, __crsql_col_name, __crsql_col_version, __crsql_db_version) VALUES
          ({pk_values}, ?, 1, crsql_nextdbversion())",
        table = escape_ident(table),
        pk_cols = pk_cols
            .iter()
            .map(|f| format!("\"{}\"", escape_ident(f)))
            .collect::<Vec<_>>()
            .join(", "),
        pk_values = pk_cols.iter().map(|_| "?").collect::<Vec<_>>().join(", "),
    ))?;

    while read_stmt.step()? == ResultCode::ROW {
        // bind primary key values
        for (i, _name) in pk_cols.iter().enumerate() {
            let value = read_stmt.column_value(i as i32)?;
            write_stmt.bind_value(i as i32 + 1, value)?;
        }

        for col in non_pk_cols.iter() {
            write_stmt.bind_text(pk_cols.len() as i32 + 1, col, Destructor::STATIC)?;
            write_stmt.step()?;
            write_stmt.reset()?;
        }
    }

    Ok(ResultCode::OK)
}

fn escape_ident(ident: &str) -> String {
    return ident.replace("\"", "\"\"");
}
