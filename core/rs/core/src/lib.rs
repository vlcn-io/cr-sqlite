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

use core::mem;
use core::ptr::null_mut;
use core::{ffi::c_char, slice};
extern crate alloc;
use automigrate::*;
use backfill::*;
use c::{crsql_freeExtData, crsql_newExtData};
use core::ffi::{c_int, c_void, CStr};
use create_crr::create_crr;
use db_version::{crsql_fill_db_version_if_needed, crsql_next_db_version};
use is_crr::*;
use sqlite::{Destructor, ResultCode};
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
        if let Err(_) = db.exec_safe("ROLLBACK") {
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
    err_msg: *mut *mut c_char,
    api: *mut sqlite::api_routines,
) -> *mut c_void {
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
        return null_mut();
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
        return null_mut();
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
        return null_mut();
    }

    let rc = unpack_columns_vtab::create_module(db).unwrap_or(sqlite::ResultCode::ERROR);
    if rc != ResultCode::OK {
        return null_mut();
    }

    let rc = create_cl_set_vtab::create_module(db).unwrap_or(ResultCode::ERROR);
    if rc != ResultCode::OK {
        return null_mut();
    }

    let rc = crate::bootstrap::crsql_init_peer_tracking_table(db);
    if rc != ResultCode::OK as c_int {
        return null_mut();
    }

    let sync_bit_ptr = sqlite::malloc(mem::size_of::<c_int>()) as *mut c_int;
    unsafe {
        *sync_bit_ptr = 0;
    }
    // Function to allow us to disable triggers when syncing remote changes
    // to base tables.
    let rc = db
        .create_function_v2(
            "crsql_internal_sync_bit",
            -1,
            sqlite::UTF8 | sqlite::INNOCUOUS,
            Some(sync_bit_ptr as *mut c_void),
            Some(x_crsql_sync_bit),
            None,
            None,
            Some(crsql_sqlite_free),
        )
        .unwrap_or(sqlite::ResultCode::ERROR);
    if rc != ResultCode::OK {
        return null_mut();
    }

    let rc = crate::bootstrap::crsql_maybe_update_db(db, err_msg);
    if rc != ResultCode::OK as c_int {
        return null_mut();
    }

    // TODO: convert this function to a proper rust function
    // and have rust free:
    // 1. site_id_buffer
    // 2. ext_data
    // automatically.

    let site_id_buffer =
        sqlite::malloc((consts::SITE_ID_LEN as usize) * mem::size_of::<*const c_char>());
    let rc = crate::bootstrap::crsql_init_site_id(db, site_id_buffer);
    if rc != ResultCode::OK as c_int {
        sqlite::free(site_id_buffer as *mut c_void);
        return null_mut();
    }

    let ext_data = unsafe { crsql_newExtData(db, site_id_buffer as *mut c_char) };
    if ext_data.is_null() {
        sqlite::free(site_id_buffer as *mut c_void);
        return null_mut();
    }

    let rc = db
        .create_function_v2(
            "crsql_site_id",
            0,
            sqlite::UTF8 | sqlite::INNOCUOUS | sqlite::DETERMINISTIC,
            Some(ext_data as *mut c_void),
            Some(x_crsql_site_id),
            None,
            None,
            None,
        )
        .unwrap_or(ResultCode::ERROR);
    if rc != ResultCode::OK {
        unsafe { crsql_freeExtData(ext_data) };
        return null_mut();
    }

    let rc = db
        .create_function_v2(
            "crsql_db_version",
            0,
            sqlite::INNOCUOUS | sqlite::UTF8,
            Some(ext_data as *mut c_void),
            Some(x_crsql_db_version),
            None,
            None,
            Some(x_free_connection_ext_data),
        )
        .unwrap_or(ResultCode::ERROR);
    if rc != ResultCode::OK {
        unsafe { crsql_freeExtData(ext_data) };
        return null_mut();
    }

    let rc = db
        .create_function_v2(
            "crsql_next_db_version",
            -1,
            sqlite::UTF8 | sqlite::INNOCUOUS,
            Some(ext_data as *mut c_void),
            Some(x_crsql_next_db_version),
            None,
            None,
            None,
        )
        .unwrap_or(ResultCode::ERROR);
    if rc != ResultCode::OK {
        unsafe { crsql_freeExtData(ext_data) };
        return null_mut();
    }

    let rc = db
        .create_function_v2(
            "crsql_increment_and_get_seq",
            0,
            sqlite::UTF8 | sqlite::INNOCUOUS,
            Some(ext_data as *mut c_void),
            Some(x_crsql_increment_and_get_seq),
            None,
            None,
            None,
        )
        .unwrap_or(ResultCode::ERROR);
    if rc != ResultCode::OK {
        unsafe { crsql_freeExtData(ext_data) };
        return null_mut();
    }

    let rc = db
        .create_function_v2(
            "crsql_get_seq",
            0,
            sqlite::UTF8 | sqlite::INNOCUOUS | sqlite::DETERMINISTIC,
            Some(ext_data as *mut c_void),
            Some(x_crsql_get_seq),
            None,
            None,
            None,
        )
        .unwrap_or(ResultCode::ERROR);
    if rc != ResultCode::OK {
        unsafe { crsql_freeExtData(ext_data) };
        return null_mut();
    }

    return ext_data as *mut c_void;
}

/**
 * return the uuid which uniquely identifies this database.
 *
 * `select crsql_site_id()`
 */
unsafe extern "C" fn x_crsql_site_id(
    ctx: *mut sqlite::context,
    _argc: i32,
    _argv: *mut *mut sqlite::value,
) {
    let ext_data = ctx.user_data() as *mut c::crsql_ExtData;
    let site_id = (*ext_data).siteId;
    sqlite::result_blob(ctx, site_id, consts::SITE_ID_LEN, Destructor::STATIC);
}

unsafe extern "C" fn x_crsql_get_seq(
    ctx: *mut sqlite::context,
    _argc: i32,
    _argv: *mut *mut sqlite::value,
) {
    let ext_data = ctx.user_data() as *mut c::crsql_ExtData;
    ctx.result_int((*ext_data).seq);
}

unsafe extern "C" fn x_crsql_increment_and_get_seq(
    ctx: *mut sqlite::context,
    _argc: i32,
    _argv: *mut *mut sqlite::value,
) {
    let ext_data = ctx.user_data() as *mut c::crsql_ExtData;
    ctx.result_int((*ext_data).seq);
    (*ext_data).seq += 1;
}

/**
 * Return the current version of the database.
 *
 * `select crsql_db_version()`
 */
unsafe extern "C" fn x_crsql_db_version(
    ctx: *mut sqlite::context,
    _argc: i32,
    _argv: *mut *mut sqlite::value,
) {
    let ext_data = ctx.user_data() as *mut c::crsql_ExtData;
    let db = ctx.db_handle();
    let mut err_msg = null_mut();
    let rc = crsql_fill_db_version_if_needed(db, ext_data, &mut err_msg as *mut _);
    if rc != ResultCode::OK as c_int {
        // TODO: pass err_msg!
        ctx.result_error("failed to fill db version");
        return;
    }
    sqlite::result_int64(ctx, (*ext_data).dbVersion);
}

/**
 * Return the next version of the database for use in inserts/updates/deletes
 *
 * `select crsql_next_db_version()`
 *
 * Nit: this should be same as `crsql_db_version`
 * If you change this behavior you need to change trigger behaviors
 * as each invocation to `nextVersion` should return the same version
 * when in the same transaction.
 */
unsafe extern "C" fn x_crsql_next_db_version(
    ctx: *mut sqlite::context,
    argc: i32,
    argv: *mut *mut sqlite::value,
) {
    let ext_data = ctx.user_data() as *mut c::crsql_ExtData;
    let db = ctx.db_handle();
    let mut err_msg = null_mut();

    let provided_version = if argc == 1 {
        sqlite::args!(argc, argv)[0].int64()
    } else {
        0
    };

    let ret = crsql_next_db_version(db, ext_data, provided_version, &mut err_msg as *mut _);
    if ret < 0 {
        // TODO: use err_msg!
        ctx.result_error("Unable to determine the next db version");
        return;
    }

    ctx.result_int64(ret);
}

unsafe extern "C" fn x_free_connection_ext_data(data: *mut c_void) {
    let ext_data = data as *mut c::crsql_ExtData;
    crsql_freeExtData(ext_data);
}

pub unsafe extern "C" fn crsql_sqlite_free(ptr: *mut c_void) {
    sqlite::free(ptr);
}

unsafe extern "C" fn x_crsql_sync_bit(
    ctx: *mut sqlite::context,
    argc: i32,
    argv: *mut *mut sqlite::value,
) {
    let sync_bit_ptr = ctx.user_data() as *mut c_int;
    if argc != 1 {
        ctx.result_int(*sync_bit_ptr);
        return;
    }

    let args = sqlite::args!(argc, argv);
    let new_value = args[0].int();
    *sync_bit_ptr = new_value;

    ctx.result_int(*sync_bit_ptr);
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
