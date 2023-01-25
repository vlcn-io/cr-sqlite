#![cfg_attr(not(test), no_std)]
#![allow(non_upper_case_globals)]
#![feature(core_intrinsics)]

mod as_ordered;
mod fractindex;

use core::ffi::c_char;
pub use fractindex::*;
use sqlite::Connection;
use sqlite_nostd as sqlite;

pub extern "C" fn crsql_as_ordered(
    ctx: *mut sqlite::context,
    argc: i32,
    argv: *mut *mut sqlite::value,
) {
    // decode the args, call as_ordered
}

#[no_mangle]
pub extern "C" fn sqlite3_crsqlfractionalindex_init(
    db: *mut sqlite::sqlite3,
    _err_msg: *mut *mut c_char,
    api: *mut sqlite::api_routines,
) -> u32 {
    sqlite::EXTENSION_INIT2(api);

    db.create_function_v2(
        "crsql_as_ordered",
        -1,
        sqlite::UTF8,
        None,
        Some(crsql_as_ordered),
        None,
        None,
        None,
    )
    .unwrap_or(sqlite::ResultCode::ERROR) as u32
}
