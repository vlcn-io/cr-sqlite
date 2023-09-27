use core::ffi::c_int;
use sqlite_nostd as sqlite;

#[no_mangle]
pub unsafe extern "C" fn crsql_after_insert(
    ctx: *mut sqlite::context,
    argc: c_int,
    argv: *mut *mut sqlite::value,
) {
}
