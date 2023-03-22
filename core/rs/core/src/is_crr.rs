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

use alloc::format;
use sqlite::Connection;
use sqlite_nostd as sqlite;
use sqlite_nostd::ResultCode;

/**
* Given a table name, returns whether or not it has already
* been upgraded to a CRR.
*/
pub fn is_crr(db: *mut sqlite::sqlite3, table: &str) -> Result<bool, ResultCode> {
    let stmt =
        db.prepare_v2("SELECT count(*) FROM sqlite_master WHERE type = 'trigger' AND name = ?")?;
    stmt.bind_text(
        1,
        &format!("{}__crsql_itrig", table),
        sqlite::Destructor::TRANSIENT,
    )?;
    stmt.step()?;
    let count = stmt.column_int(0)?;

    if count == 0 {
        Ok(false)
    } else {
        Ok(true)
    }
}
