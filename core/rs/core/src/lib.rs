#![cfg_attr(not(test), no_std)]
#![feature(vec_into_raw_parts)]

// TODO: these pub mods are exposed for the integration testing
// we should re-export in a `test` mod such that they do not become public apis
mod alter;
mod automigrate;
mod backfill;
#[cfg(feature = "test")]
pub mod bootstrap;
#[cfg(not(feature = "test"))]
mod bootstrap;
#[cfg(feature = "test")]
pub mod c;
#[cfg(not(feature = "test"))]
mod c;
mod changes_vtab;
mod changes_vtab_read;
mod changes_vtab_write;
mod compare_values;
mod consts;
mod create_cl_set_vtab;
mod create_crr;
#[cfg(feature = "test")]
pub mod db_version;
#[cfg(not(feature = "test"))]
mod db_version;
mod ext_data;
mod is_crr;
mod local_writes;
#[cfg(feature = "test")]
pub mod pack_columns;
#[cfg(not(feature = "test"))]
mod pack_columns;
mod stmt_cache;
#[cfg(feature = "test")]
pub mod tableinfo;
#[cfg(not(feature = "test"))]
mod tableinfo;
mod teardown;
#[cfg(feature = "test")]
pub mod test_exports;
mod triggers;
mod unpack_columns_vtab;
mod util;

use core::{ffi::c_char, slice};
extern crate alloc;
use automigrate::*;
use backfill::*;
use core::ffi::{c_int, CStr};
use create_crr::create_crr;
use is_crr::*;
use sqlite::ResultCode;
use sqlite_nostd as sqlite;
use sqlite_nostd::{Connection, Context, Value};
use tableinfo::is_table_compatible;
use teardown::*;

pub extern "C" fn crsql_as_table(
    ctx: *mut sqlite::context,
    argc: i32,
    argv: *mut *mut sqlite::value,
) {
    let args = sqlite::args!(argc, argv);
    let db = ctx.db_handle();
    let table = args[0].text();

    if let Err(_) = db.exec_safe("SAVEPOINT as_table;") {
        ctx.result_error("failed to start as_table savepoint");
        return;
    }

    if let Err(_) = crsql_as_table_impl(db, table) {
        ctx.result_error("failed to downgrade the crr");
        if let Err(_) = db.exec_safe("ROLLBACK TO as_table;") {
            // fine.
        }
        return;
    }

    if let Err(_) = db.exec_safe("RELEASE as_table;") {
        // fine
    }
}

fn crsql_as_table_impl(db: *mut sqlite::sqlite3, table: &str) -> Result<ResultCode, ResultCode> {
    remove_crr_clock_table_if_exists(db, table)?;
    remove_crr_triggers_if_exist(db, table)
}

#[no_mangle]
pub extern "C" fn sqlite3_crsqlcore_init(
    db: *mut sqlite::sqlite3,
    _err_msg: *mut *mut c_char,
    api: *mut sqlite::api_routines,
) -> c_int {
    sqlite::EXTENSION_INIT2(api);

    let rc = db
        .create_function_v2(
            "crsql_automigrate",
            -1,
            sqlite::UTF8,
            None,
            Some(crsql_automigrate),
            None,
            None,
            None,
        )
        .unwrap_or(sqlite::ResultCode::ERROR);
    if rc != ResultCode::OK {
        return rc as c_int;
    }

    let rc = db
        .create_function_v2(
            "crsql_pack_columns",
            -1,
            sqlite::UTF8,
            None,
            Some(pack_columns::crsql_pack_columns),
            None,
            None,
            None,
        )
        .unwrap_or(sqlite::ResultCode::ERROR);
    if rc != ResultCode::OK {
        return rc as c_int;
    }

    let rc = db
        .create_function_v2(
            "crsql_as_table",
            1,
            sqlite::UTF8,
            None,
            Some(crsql_as_table),
            None,
            None,
            None,
        )
        .unwrap_or(sqlite::ResultCode::ERROR);
    if rc != ResultCode::OK {
        return rc as c_int;
    }

    let rc = unpack_columns_vtab::create_module(db).unwrap_or(sqlite::ResultCode::ERROR);
    if rc != ResultCode::OK {
        return rc as c_int;
    }
    let rc = create_cl_set_vtab::create_module(db).unwrap_or(ResultCode::ERROR);
    return rc as c_int;
}

#[no_mangle]
pub extern "C" fn crsql_remove_crr_triggers_if_exist(
    db: *mut sqlite::sqlite3,
    table: *const c_char,
) -> c_int {
    if let Ok(table) = unsafe { CStr::from_ptr(table).to_str() } {
        let result = remove_crr_triggers_if_exist(db, table);
        match result {
            Ok(result) => result as c_int,
            Err(result) => result as c_int,
        }
    } else {
        ResultCode::NOMEM as c_int
    }
}

#[no_mangle]
pub extern "C" fn crsql_is_crr(db: *mut sqlite::sqlite3, table: *const c_char) -> c_int {
    if let Ok(table) = unsafe { CStr::from_ptr(table).to_str() } {
        match is_crr(db, table) {
            Ok(b) => {
                if b {
                    1
                } else {
                    0
                }
            }
            Err(c) => (c as c_int) * -1,
        }
    } else {
        (ResultCode::NOMEM as c_int) * -1
    }
}

#[no_mangle]
pub extern "C" fn crsql_is_table_compatible(
    db: *mut sqlite::sqlite3,
    table: *const c_char,
    err: *mut *mut c_char,
) -> c_int {
    if let Ok(table) = unsafe { CStr::from_ptr(table).to_str() } {
        is_table_compatible(db, table, err)
            .map(|x| x as c_int)
            .unwrap_or_else(|err| (err as c_int) * -1)
    } else {
        (ResultCode::NOMEM as c_int) * -1
    }
}

#[no_mangle]
pub extern "C" fn crsql_create_crr(
    db: *mut sqlite::sqlite3,
    schema: *const c_char,
    table: *const c_char,
    is_commit_alter: c_int,
    no_tx: c_int,
    err: *mut *mut c_char,
) -> c_int {
    let schema = unsafe { CStr::from_ptr(schema).to_str() };
    let table = unsafe { CStr::from_ptr(table).to_str() };

    return match (table, schema) {
        (Ok(table), Ok(schema)) => {
            create_crr(db, schema, table, is_commit_alter != 0, no_tx != 0, err)
                .unwrap_or_else(|err| err) as c_int
        }
        _ => ResultCode::NOMEM as c_int,
    };
}
