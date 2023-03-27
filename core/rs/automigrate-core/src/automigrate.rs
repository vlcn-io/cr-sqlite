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

extern crate alloc;

use alloc::collections::BTreeSet;
use alloc::string::ToString;
// use alloc::string::String;
// use alloc::vec;
// use alloc::vec::Vec;
use alloc::vec::Vec;
use core::ffi::{c_char, c_int};
use core::slice;
// use sqlite::ResultCode;
use sqlite_nostd as sqlite;

use sqlite::{args, ManagedConnection, Value};
use sqlite::{strlit, Context};
use sqlite::{Connection, ResultCode};
// use sqlite::Value;

/**
New API:
"automigrate table"

So schema definition, w/ auto-migration, looks like:

SELECT crsql_automigrate_crr('tbl', 'CREATE TABLE ...');

Kind gross.

CRRs could be in one schema and normal tbls in another?

automigrate_crrs

automigrate_tables

and each take a schema str?

All can be in same file and user can split if desired.

SELECT crsql_create_or_migrate_to(`
    CREATE TABLE ...
`);

Kind of annoying given tooling this breaks.

schema.file:

-- Persisted CRRs
CREATE TABLE ...;
CREATE TABLE ...;
-- end Persisted CRRs

-- temp tables are whatever.

CREATE TABLE ...;

end.file

Then we use the files:

SELECT crsql_automigrate_crrs(crr_stmts);
SELECT crsql_automigrate_tables(tbl_stmts);

Have the user track schema version on their own?
*/

/**
* Automigrate args:
* 1 - the schema content
* Only create table statements shall be present in the provided schema
* Users are responsible for tracking schema version and applying the migration or not
*/
pub extern "C" fn crsql_automigrate(
    ctx: *mut sqlite::context,
    argc: c_int,
    argv: *mut *mut sqlite::value,
) {
    if argc != 1 {
        ctx.result_error("Expected a single argument -- the schema string of create table statements to migrate to");
        return;
    }

    let args = args!(argc, argv);
    if let Err(_) = automigrate_impl(ctx, args) {
        ctx.result_error("failed to apply the updated schema");
        return;
    }

    ctx.result_text_transient("Migration complete");
}

fn automigrate_impl(
    ctx: *mut sqlite::context,
    args: &[*mut sqlite::value],
) -> Result<ResultCode, ResultCode> {
    let local_db = ctx.db_handle();
    let desired_schemas = args[0].text();

    let mem_db = sqlite::open(strlit!(":memory:"))?;
    mem_db.exec_safe(desired_schemas);
    local_db.exec_safe("SAVEPOINT automigrate_tables;")?;
    if let Err(e) = migrate_to(local_db, mem_db) {
        local_db.exec_safe("ROLLBACK TO automigrate_tables")?;
        return Err(e);
    }
    local_db.exec_safe("RELEASE automigrate_tables")?;
    Ok(())
}

fn migrate_to(local_db: *mut sqlite3, mem_db: ManagedConnection) -> Result<ResultCode, ResultCode> {
    let mut mem_tables = BTreeSet::new();
    let mut local_tables = BTreeSet::new();

    let sql = "SELECT name FROM sqlite_master WHERE type = 'table'";
    let fetch_mem_tables = mem_db.prepare_v2(sql)?;
    let fetch_local_tables = local_db.prepare_v2(sql)?;

    while fetch_mem_tables.step()? == ResultCode::ROW {
        mem_tables.insert(fetch_mem_tables.column_text(0)?.to_string());
    }

    let mut removed_tables = vec![];
    let mut added_tables = vec![];
    let mut maybe_modified_tables = vec![];

    while fetch_local_tables.step()? == ResultCode::ROW {
        let table_name = fetch_local_tables.column_text(0)?.to_string();
        local_tables.insert(table_name);
        if mem_tables.contains(&table_name) {
            maybe_modified_tables.add(&table_name);
        } else {
            removed_tables.add(&table_name);
        }
    }

    // now to discover added tables
    // for that we iterate over mem tables
    // and see which are not present in local tables
}

// fn find_dropped_tables() -> Result<Vec<String>, ResultCode> {
//     Ok(vec![])
// }

// fn find_new_tables() -> Result<Vec<String>, ResultCode> {
//     Ok(vec![])
// }

// struct ModifiedTable {
//     name: String,
//     new_columns: Vec<String>,
//     dropped_columns: Vec<String>,
//     modified_columns: Vec<String>,
// }

// fn find_modified_tables() -> Result<Vec<ModifiedTable>, ResultCode> {
//     Ok(vec![])
// }

#[no_mangle]
pub extern "C" fn sqlite3_automigrate_init(
    db: *mut sqlite::sqlite3,
    _err_msg: *mut *mut c_char,
    api: *mut sqlite::api_routines,
) -> c_int {
    sqlite::EXTENSION_INIT2(api);

    db.create_function_v2(
        "crsql_automigrate",
        1,
        sqlite::UTF8,
        None,
        Some(automigrate_tables),
        None,
        None,
        None,
    )
    .unwrap_or(sqlite::ResultCode::ERROR) as c_int
}
