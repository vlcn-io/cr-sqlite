#![no_std]

extern crate alloc;

use alloc::string::String;
use core::ffi::c_char;
use sqlite_nostd as sqlite;

use sqlite::Connection;
use sqlite::Context;

pub extern "C" fn crsql_automigrate(
    ctx: *mut sqlite::context,
    _argc: i32,
    _argv: *mut *mut sqlite::value,
) {
    // let args = sqlite::args!(argc, argv);
    ctx.result_text_owned(String::from("ello mate!"));
}

#[no_mangle]
pub extern "C" fn sqlite3_crsqlautomigrate_init(
    db: *mut sqlite::sqlite3,
    _err_msg: *mut *mut c_char,
    api: *mut sqlite::api_routines,
) -> u32 {
    sqlite::EXTENSION_INIT2(api);

    db.create_function_v2(
        sqlite::strlit!("crsql_automigrate"),
        0,
        sqlite::UTF8,
        None,
        Some(crsql_automigrate),
        None,
        None,
        None,
    )
    .unwrap_or(sqlite::ResultCode::ERROR) as u32
}
