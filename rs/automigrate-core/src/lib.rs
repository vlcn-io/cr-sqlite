#![no_std]

use core::ffi::c_char;
use sqlite_nostd as sqlite;

#[no_mangle]
pub extern "C" fn sqlite3_crsqlautomigrate_init(
    _db: *mut sqlite::sqlite3,
    _err_msg: *mut *mut c_char,
    _api: *mut sqlite::api_routines,
) -> u32 {
    sqlite::OK
}
