extern crate alloc;

use core::ffi::{c_char, c_int, c_void};
use core::slice;

use alloc::boxed::Box;
use alloc::ffi::CString;
use alloc::format;
use alloc::vec::Vec;
use sqlite::{Connection, Context, Value};
use sqlite_nostd as sqlite;
use sqlite_nostd::ResultCode;

// Virtual table definition to create a causal length set backed table.

extern "C" fn create(
    db: *mut sqlite::sqlite3,
    _aux: *mut c_void,
    _argc: c_int,
    _argv: *const *const c_char,
    vtab: *mut *mut sqlite::vtab,
    _err: *mut *mut c_char,
) -> c_int {
    0
}

extern "C" fn connect(
    db: *mut sqlite::sqlite3,
    _aux: *mut c_void,
    _argc: c_int,
    _argv: *const *const c_char,
    vtab: *mut *mut sqlite::vtab,
    _err: *mut *mut c_char,
) -> c_int {
    0
}

extern "C" fn best_index(vtab: *mut sqlite::vtab, index_info: *mut sqlite::index_info) -> c_int {
    0
}

extern "C" fn disconnect(vtab: *mut sqlite::vtab) -> c_int {
    unsafe {
        drop(Box::from_raw(vtab));
    }
    ResultCode::OK as c_int
}

extern "C" fn open(_vtab: *mut sqlite::vtab, cursor: *mut *mut sqlite::vtab_cursor) -> c_int {
    0
}

extern "C" fn close(cursor: *mut sqlite::vtab_cursor) -> c_int {
    0
}

extern "C" fn filter(
    cursor: *mut sqlite::vtab_cursor,
    _idx_num: c_int,
    _idx_str: *const c_char,
    argc: c_int,
    argv: *mut *mut sqlite::value,
) -> c_int {
    0
}

extern "C" fn next(cursor: *mut sqlite::vtab_cursor) -> c_int {
    0
}

extern "C" fn eof(cursor: *mut sqlite::vtab_cursor) -> c_int {
    0
}

extern "C" fn column(
    cursor: *mut sqlite::vtab_cursor,
    ctx: *mut sqlite::context,
    col_num: c_int,
) -> c_int {
    0
}

extern "C" fn rowid(cursor: *mut sqlite::vtab_cursor, row_id: *mut sqlite::int64) -> c_int {
    0
}

static MODULE: sqlite_nostd::module = sqlite_nostd::module {
    iVersion: 0,
    xCreate: Some(create),
    xConnect: Some(connect),
    xBestIndex: Some(best_index),
    xDisconnect: Some(disconnect),
    xDestroy: None,
    xOpen: Some(open),
    xClose: Some(close),
    xFilter: Some(filter),
    xNext: Some(next),
    xEof: Some(eof),
    xColumn: Some(column),
    xRowid: Some(rowid),
    xUpdate: None,
    xBegin: None,
    xSync: None,
    xCommit: None,
    xRollback: None,
    xFindFunction: None,
    xRename: None,
    xSavepoint: None,
    xRelease: None,
    xRollbackTo: None,
    xShadowName: None,
};

/**
* CREATE TABLE [x] (cell, package HIDDEN);
* SELECT cell FROM crsql_unpack_columns WHERE package = ___;
*/
pub fn create_module(db: *mut sqlite::sqlite3) -> Result<ResultCode, ResultCode> {
    db.create_module_v2("CLSet", &MODULE, None, None)?;

    Ok(ResultCode::OK)
}
