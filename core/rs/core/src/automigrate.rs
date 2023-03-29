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
use sqlite::ColumnType;
use sqlite_nostd as sqlite;

use sqlite::{args, sqlite3, ManagedConnection, Value};
use sqlite::{strlit, Context};
use sqlite::{Connection, ResultCode};

/**
* Automigrate args:
* 1 - the schema content
* Users are responsible for tracking schema version and applying the migration or not.
*
* We may want to move automigrate to its own crate.
* It is rather limited in completeness and may only be
* useful to myself.
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
    let desired_schema = args[0].text();
    let (desired_schema, stripped_crr_statements) = strip_crr_statements(desired_schema)?;

    let result = sqlite::open(strlit!(":memory:"));
    if let Ok(mem_db) = result {
        if let Err(_) = mem_db.exec_safe(&desired_schema) {
            return Err(ResultCode::SCHEMA);
        }
        local_db.exec_safe("SAVEPOINT automigrate_tables;")?;
        if let Err(_) = migrate_to(local_db, mem_db) {
            local_db.exec_safe("ROLLBACK TO automigrate_tables")?;
            return Err(ResultCode::MISMATCH);
        }
        if let Err(e) = apply_stripped_crr_statements(local_db, stripped_crr_statements) {
            local_db.exec_safe("ROLLBACK TO automigrate_tables")?;
            return Err(e);
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

/**
* stripts `select crsql_as_crr` statements
* from the provided schema.
* returns which tables were crrs so we can re-apply the statements
* once migrations are complete.
*
* We have to strip the statements given we can't load an extension into an extension
* in all environment.
*
* E.g., if cr-sqlite is running as a runtime loadable ext
* then it cannot open an in-memory db within itself that loads this same
* extension.
*/
fn strip_crr_statements(schema: &str) -> Result<(String, Vec<String>), ResultCode> {
    let mut crr_stmts = vec![];
    let stripped = schema
        .split("\n")
        .filter(|line| {
            let is_crr_stmt = line.to_lowercase().contains("crsql_as_crr");
            crr_stmts.push(line.to_string());
            !is_crr_stmt
        })
        .collect::<Vec<_>>()
        .join("\n");
    Ok((stripped, crr_stmts))
}

fn apply_stripped_crr_statements(
    local_db: *mut sqlite3,
    stmts: Vec<String>,
) -> Result<ResultCode, ResultCode> {
    for stmt in stmts {
        local_db.exec_safe(&stmt)?;
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

// TODO: we could potentially track renames...
fn maybe_modify_table(
    local_db: *mut sqlite3,
    table: &str,
    mem_db: &ManagedConnection,
) -> Result<ResultCode, ResultCode> {
    let mut local_columns = BTreeSet::new();
    let mut mem_columns = BTreeSet::new();

    let sql = "SELECT name FROM pragma_table_info(?)";
    let local_stmt = local_db.prepare_v2(sql)?;
    let mem_stmt = mem_db.prepare_v2(sql)?;
    local_stmt.bind_text(1, table, sqlite::Destructor::STATIC)?;
    mem_stmt.bind_text(1, table, sqlite::Destructor::STATIC)?;

    while mem_stmt.step()? == ResultCode::ROW {
        mem_columns.insert(mem_stmt.column_text(0)?.to_string());
    }

    let mut removed_columns: Vec<String> = vec![];
    let mut added_columns: Vec<String> = vec![];

    while local_stmt.step()? == ResultCode::ROW {
        let col_name = local_stmt.column_text(0)?;
        local_columns.insert(col_name.to_string());
        if !mem_columns.contains(col_name) {
            removed_columns.push(col_name.to_string());
        }
    }

    for mem_col in mem_columns {
        if !local_columns.contains(&mem_col) {
            added_columns.push(mem_col);
        }
    }

    let is_a_crr = crate::is_crr(local_db, table)?;
    if is_a_crr {
        let stmt = local_db.prepare_v2("SELECT crsql_begin_alter(?)")?;
        stmt.bind_text(1, table, sqlite::Destructor::STATIC)?;
        stmt.step()?;
    }

    drop_columns(local_db, table, removed_columns)?;
    add_columns(local_db, table, added_columns, mem_db)?;
    maybe_update_indices(local_db, table, mem_db)?;

    if is_a_crr {
        let stmt = local_db.prepare_v2("SELECT crsql_commit_alter(?)")?;
        stmt.bind_text(1, table, sqlite::Destructor::STATIC)?;
        stmt.step()?;
    }

    Ok(ResultCode::OK)
}

fn drop_columns(
    local_db: *mut sqlite3,
    table: &str,
    columns: Vec<String>,
) -> Result<ResultCode, ResultCode> {
    for col in columns {
        local_db.exec_safe(&format!(
            "ALTER TABLE \"{table}\" DROP \"{column}\"",
            table = crate::escape_ident(table),
            column = crate::escape_ident(&col)
        ))?;
    }

    Ok(ResultCode::OK)
}

fn add_columns(
    local_db: *mut sqlite3,
    table: &str,
    columns: Vec<String>,
    mem_db: &ManagedConnection,
) -> Result<ResultCode, ResultCode> {
    let stmt = mem_db.prepare_v2(&format!(
        "SELECT name, type, notnull, dflt_value, pk FROM pragma_table_info(?) WHERE name IN ({qs})",
        qs = columns.iter().map(|_| "?").collect::<Vec<_>>().join(", "),
    ))?;
    stmt.bind_text(1, table, sqlite::Destructor::STATIC)?;
    let mut b = 2;
    for col in columns {
        stmt.bind_text(b, &col, sqlite::Destructor::STATIC)?;
        b += 1;
    }

    while stmt.step()? == ResultCode::ROW {
        let is_pk = stmt.column_int(4)? == 1;

        if is_pk {
            // We do not support adding PK columns to existing tables in auto-migration
            return Err(ResultCode::MISUSE);
        }

        let name = stmt.column_text(0)?;
        let col_type = stmt.column_text(1)?;
        let notnull = stmt.column_int(2)? == 1;
        let dflt_val = stmt.column_value(3)?;

        add_column(local_db, table, name, col_type, notnull, dflt_val)?;
    }

    Ok(ResultCode::OK)
}

fn add_column(
    local_db: *mut sqlite3,
    table: &str,
    name: &str,
    col_type: &str,
    notnull: bool,
    dflt_val: *mut sqlite::value,
) -> Result<ResultCode, ResultCode> {
    // ideally we'd extract out the SQL for the specific column
    // so we can get all constraints
    // as it is now, we don't support many things in auto-migration
    let dflt_val_str = if dflt_val.value_type() == ColumnType::Null {
        String::from("")
    } else {
        format!("DEFAULT {}", dflt_val.text())
    };

    local_db.exec_safe(&format!(
        "ALTER TABLE \"{table}\" ADD COLUMN \"{name}\" {col_type} {notnull} {dflt}",
        table = crate::escape_ident(table),
        name = crate::escape_ident(name),
        col_type = col_type,
        notnull = if notnull { "NOT NULL " } else { "" },
        dflt = dflt_val_str
    ))
}

fn maybe_update_indices(
    local_db: *mut sqlite3,
    table: &str,
    mem_db: &ManagedConnection,
) -> Result<ResultCode, ResultCode> {
    // We do not pull PK indices because we do not support alterations that changes
    // primary key definitions.
    // User would need to perform a manual migration for that.
    // This is due to the fact that SQLite itself does not support changing primary key
    // definitions in alter table statements.
    let sql = "SELECT name FROM pragma_index_list(?) WHERE origin != 'pk';";
    let local_fetch = local_db.prepare_v2(sql)?;
    let mem_fetch = mem_db.prepare_v2(sql)?;
    local_fetch.bind_text(1, table, sqlite::Destructor::STATIC)?;
    mem_fetch.bind_text(1, table, sqlite::Destructor::STATIC)?;

    let mut local_indices = BTreeSet::new();
    let mut mem_indices = BTreeSet::new();

    while mem_fetch.step()? == ResultCode::ROW {
        mem_indices.insert(mem_fetch.column_text(0)?.to_string());
    }

    let mut removed: Vec<String> = vec![];
    let mut added: Vec<String> = vec![];
    let mut maybe_modified: Vec<String> = vec![];

    while local_fetch.step()? == ResultCode::ROW {
        let name = local_fetch.column_text(0)?;
        local_indices.insert(name.to_string());
        if !mem_indices.contains(name) {
            removed.push(name.to_string());
        } else {
            maybe_modified.push(name.to_string());
        }
    }

    for mem_idx in mem_indices {
        if !local_indices.contains(&mem_idx) {
            added.push(mem_idx);
        }
    }

    drop_indices(local_db, removed)?;
    add_indices(local_db, table, added, mem_db)?;

    for idx in maybe_modified {
        maybe_recreate_index(local_db, table, &idx, mem_db)?;
    }

    Ok(ResultCode::OK)
}

fn drop_indices(local_db: *mut sqlite3, dropped: Vec<String>) -> Result<ResultCode, ResultCode> {
    for idx in dropped {
        local_db.exec_safe(&format!("DROP INDEX \"{}\"", crate::escape_ident(&idx)))?;
    }
    Ok(ResultCode::OK)
}

fn add_indices(
    local_db: *mut sqlite3,
    table: &str,
    added: Vec<String>,
    mem_db: &ManagedConnection,
) -> Result<ResultCode, ResultCode> {
    let fetch_is_unique =
        mem_db.prepare_v2("SELECT unique FROM pragma_index_list(?) WHERE name = ?")?;
    let fetch_idx_info =
        mem_db.prepare_v2("SELECT name FROM pragma_index_info(?) ORDER BY seqno ASC")?;
    for idx in added {
        fetch_is_unique.bind_text(1, table, sqlite::Destructor::STATIC)?;
        fetch_is_unique.bind_text(2, &idx, sqlite::Destructor::STATIC)?;
        let step_result = fetch_is_unique.step()?;
        if step_result == ResultCode::DONE {
            // the index exists but we could not find it the second time around??
            return Err(ResultCode::CONSTRAINT);
        }

        fetch_idx_info.bind_text(1, &idx, sqlite::Destructor::STATIC)?;
        let mut indexed_columns = vec![];
        while fetch_idx_info.step()? == ResultCode::ROW {
            indexed_columns.push(fetch_idx_info.column_text(0)?.to_string());
        }

        let is_unique = fetch_is_unique.column_int(0)? == 1;
        local_db.exec_safe(&format!(
            "CREATE {unique} INDEX {idx} ON {table} ({columns})",
            unique = if is_unique { "UNIQUE" } else { "" },
            idx = idx,
            table = table,
            columns = indexed_columns.join(", ")
        ))?;

        fetch_is_unique.reset()?;
        fetch_idx_info.reset()?;
    }
    Ok(ResultCode::OK)
}

fn maybe_recreate_index(
    _local_db: *mut sqlite3,
    _table: &str,
    _idx: &str,
    _mem_db: &ManagedConnection,
) -> Result<ResultCode, ResultCode> {
    // SQLite does not support alter index statements
    // Instead we determine if the index definition changed.
    // If so, we drop the index and re-create it with the new definition.
    // compare local_db def against mem_db def.
    // if differ, recreate.
    Ok(ResultCode::OK)
}
