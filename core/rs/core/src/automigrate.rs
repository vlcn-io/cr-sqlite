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
use alloc::format;
use alloc::string::String;
use alloc::string::ToString;
use alloc::vec;
use alloc::vec::Vec;
use core::ffi::{c_char, c_int};
use core::slice;
// use sqlite::ResultCode;
use sqlite_nostd as sqlite;

use sqlite::{args, sqlite3, ManagedConnection, Value};
use sqlite::{strlit, Context};
use sqlite::{Connection, ResultCode};
// use sqlite::Value;

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
    if let Err(code) = automigrate_impl(ctx, args) {
        ctx.result_error("failed to apply the updated schema");
        ctx.result_error_code(code);
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

    let result = sqlite::open(strlit!(":memory:"));
    if let Ok(mem_db) = result {
        if let Err(_) = mem_db.exec_safe(desired_schemas) {
            return Err(ResultCode::SCHEMA);
        }
        local_db.exec_safe("SAVEPOINT automigrate_tables;")?;
        if let Err(e) = migrate_to(local_db, mem_db) {
            local_db.exec_safe("ROLLBACK TO automigrate_tables")?;
            return Err(ResultCode::MISMATCH);
        }
        local_db.exec_safe("RELEASE automigrate_tables")
    } else {
        return Err(ResultCode::CANTOPEN);
    }
}

fn migrate_to(local_db: *mut sqlite3, mem_db: ManagedConnection) -> Result<ResultCode, ResultCode> {
    let mut mem_tables: BTreeSet<String> = BTreeSet::new();
    let mut local_tables: BTreeSet<String> = BTreeSet::new();

    let sql = "SELECT name FROM sqlite_master WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
        AND name NOT LIKE 'crsql_%'
        AND name NOT LIKE '__crsql_%'";
    let fetch_mem_tables = mem_db.prepare_v2(sql)?;
    let fetch_local_tables = local_db.prepare_v2(sql)?;

    while fetch_mem_tables.step()? == ResultCode::ROW {
        mem_tables.insert(fetch_mem_tables.column_text(0)?.to_string());
    }

    let mut removed_tables: Vec<String> = vec![];
    let mut added_tables: Vec<String> = vec![];
    let mut maybe_modified_tables: Vec<String> = vec![];

    while fetch_local_tables.step()? == ResultCode::ROW {
        let table_name = fetch_local_tables.column_text(0)?;
        local_tables.insert(table_name.to_string());
        if mem_tables.contains(table_name) {
            maybe_modified_tables.push(table_name.to_string());
        } else {
            removed_tables.push(table_name.to_string());
        }
    }

    for mem_table in mem_tables {
        if !local_tables.contains(&mem_table) {
            added_tables.push(mem_table);
        }
    }

    drop_tables(local_db, removed_tables)?;
    create_tables(local_db, added_tables, &mem_db)?;
    for table in maybe_modified_tables {
        maybe_modify_table(local_db, &table, &mem_db)?;
    }
    Ok(ResultCode::OK)
}

fn drop_tables(local_db: *mut sqlite3, tables: Vec<String>) -> Result<ResultCode, ResultCode> {
    for table in tables {
        local_db.exec_safe(&format!(
            "DROP TABLE \"{table}\"",
            table = crate::escape_ident(&table)
        ))?;
    }

    Ok(ResultCode::OK)
}

fn create_tables(
    local_db: *mut sqlite3,
    tables: Vec<String>,
    mem_db: &ManagedConnection,
) -> Result<ResultCode, ResultCode> {
    let stmt =
        mem_db.prepare_v2("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")?;
    for table in tables {
        stmt.bind_text(1, &table, sqlite::Destructor::STATIC)?;
        if stmt.step()? == ResultCode::ROW {
            local_db.exec_safe(stmt.column_text(0)?)?;
            stmt.reset()?;
        } else {
            return Err(ResultCode::ERROR);
        }
    }
    Ok(ResultCode::OK)
}

fn maybe_modify_table(
    local_db: *mut sqlite3,
    table: &str,
    mem_db: &ManagedConnection,
) -> Result<ResultCode, ResultCode> {
    // let mut local_columns = BTreeSet::new();
    // let mut mem_columns = BTreeSet::new();

    // xinfo statement or just info?

    Ok(ResultCode::OK)
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
