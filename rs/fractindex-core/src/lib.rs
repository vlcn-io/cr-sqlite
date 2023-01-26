#![cfg_attr(not(test), no_std)]
#![allow(non_upper_case_globals)]
#![feature(core_intrinsics)]

mod as_ordered;
mod fractindex;
mod fractindex_view;
mod util;

use core::ffi::c_char;
use core::slice;
pub use fractindex::*;
use sqlite::args;
use sqlite::Connection;
use sqlite::ResultCode;
use sqlite::{Context, Value};
use sqlite_nostd as sqlite;

pub extern "C" fn crsql_fract_as_ordered(
    ctx: *mut sqlite::context,
    argc: i32,
    argv: *mut *mut sqlite::value,
) {
    let args = args!(argc, argv);
    // decode the args, call as_ordered
    if args.len() < 2 {
        ctx.result_error(
            "Must provide at least 2 arguments -- the table name and the column to order by",
        );
        return;
    }

    let db = ctx.db_handle();
    let table = args[0].text();
    let collection_columns = &args[2..];
    as_ordered::as_ordered(ctx, db, table, args[1], collection_columns);
}

pub extern "C" fn crsql_fract_key_between(
    _ctx: *mut sqlite::context,
    argc: i32,
    argv: *mut *mut sqlite::value,
) {
    let _args = args!(argc, argv);
}

pub extern "C" fn crsql_fract_fix_conflict_return_old_key(
    _ctx: *mut sqlite::context,
    argc: i32,
    argv: *mut *mut sqlite::value,
) {
    let _args = args!(argc, argv);

    // process args
    // call fix_conflict_return_old_key
}

#[no_mangle]
pub extern "C" fn sqlite3_crsqlfractionalindex_init(
    db: *mut sqlite::sqlite3,
    _err_msg: *mut *mut c_char,
    api: *mut sqlite::api_routines,
) -> u32 {
    sqlite::EXTENSION_INIT2(api);

    if let Err(rc) = db.create_function_v2(
        "crsql_fract_as_ordered",
        -1,
        sqlite::UTF8 | sqlite::DIRECTONLY,
        None,
        Some(crsql_fract_as_ordered),
        None,
        None,
        None,
    ) {
        return rc as u32;
    }

    if let Err(rc) = db.create_function_v2(
        "crsql_fract_key_between",
        2,
        sqlite::UTF8 | sqlite::DETERMINISTIC | sqlite::INNOCUOUS,
        None,
        Some(crsql_fract_key_between),
        None,
        None,
        None,
    ) {
        return rc as u32;
    }

    if let Err(rc) = db.create_function_v2(
        "crsql_fract_fix_conflict_return_old_key",
        -1,
        sqlite::UTF8,
        None,
        Some(crsql_fract_fix_conflict_return_old_key),
        None,
        None,
        None,
    ) {
        return rc as u32;
    }

    ResultCode::OK as u32
}
