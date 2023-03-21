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

use sqlite_nostd as sqlite;
use sqlite_nostd::{Connection, ResultCode};
extern crate alloc;
use alloc::format;

pub fn remove_crr_clock_table_if_exists(
    db: *mut sqlite::sqlite3,
    table: &str,
) -> Result<ResultCode, ResultCode> {
    let escaped_table = crate::escape_ident(table);
    db.exec_safe(&format!(
        "DROP TABLE IF EXISTS \"{table}__crsql_clock\"",
        table = escaped_table
    ))
}

pub fn remove_crr_triggers_if_exist(
    db: *mut sqlite::sqlite3,
    table: &str,
) -> Result<ResultCode, ResultCode> {
    let escaped_table = crate::escape_ident(table);

    db.exec_safe(&format!(
        "DROP TRIGGER IF EXISTS \"{table}__crsql_itrig\"",
        table = escaped_table
    ))?;

    db.exec_safe(&format!(
        "DROP TRIGGER IF EXISTS \"{table}__crsql_utrig\"",
        table = escaped_table
    ))?;

    db.exec_safe(&format!(
        "DROP TRIGGER IF EXISTS \"{table}__crsql_dtrig\"",
        table = escaped_table
    ))
}
