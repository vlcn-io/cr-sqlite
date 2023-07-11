extern crate alloc;

use core::ffi::{c_char, c_int, c_void};

use alloc::boxed::Box;
use sqlite::Connection;
use sqlite_nostd as sqlite;
use sqlite_nostd::ResultCode;

enum Columns {
    CELL = 0,
    PACKAGE = 1,
}

extern "C" fn connect(
    db: *mut sqlite::sqlite3,
    _aux: *mut c_void,
    _argc: c_int,
    _argv: *const *const c_char,
    vtab: *mut *mut sqlite::vtab,
    _err: *mut *mut c_char,
) -> c_int {
    // TODO: more ergonomic rust binding for this
    let rc = sqlite::declare_vtab(
        db,
        sqlite::strlit!("CREATE TABLE x(cell ANY, package BLOB hidden);"),
    );
    if rc != 0 {
        return rc;
    }
    unsafe {
        // TODO: more ergonomic rust bindings
        *vtab = Box::into_raw(Box::new(sqlite::vtab {
            nRef: 0,
            pModule: core::ptr::null(),
            zErrMsg: core::ptr::null_mut(),
        }));
        sqlite::vtab_config(db, sqlite::INNOCUOUS);
    }
    ResultCode::OK as c_int
}

extern "C" fn best_index(vtab: *mut sqlite::vtab, index_info: *mut sqlite::index_info) -> c_int {
    ResultCode::OK as c_int
}

extern "C" fn disconnect(vtab: *mut sqlite::vtab) -> c_int {
    sqlite::free(vtab as *mut c_void);
    ResultCode::OK as c_int
}

extern "C" fn open(vtab: *mut sqlite::vtab, cursor: *mut *mut sqlite::vtab_cursor) -> c_int {
    ResultCode::OK as c_int
}

extern "C" fn close(vtab: *mut sqlite::vtab_cursor) -> c_int {
    ResultCode::OK as c_int
}

extern "C" fn filter(
    cursor: *mut sqlite::vtab_cursor,
    idx_num: c_int,
    idx_str: *const c_char,
    argc: c_int,
    argv: *mut *mut sqlite::value,
) -> c_int {
    ResultCode::OK as c_int
}

extern "C" fn next(cursor: *mut sqlite::vtab_cursor) -> c_int {
    ResultCode::OK as c_int
}

extern "C" fn eof(cursor: *mut sqlite::vtab_cursor) -> c_int {
    ResultCode::OK as c_int
}

extern "C" fn column(
    cursor: *mut sqlite::vtab_cursor,
    context: *mut sqlite::context,
    col_num: c_int,
) -> c_int {
    ResultCode::OK as c_int
}

extern "C" fn rowid(cursor: *mut sqlite::vtab_cursor, row_id: *mut sqlite::int64) -> c_int {
    ResultCode::OK as c_int
}

/**
 * CREATE TABLE [x] (cell, package HIDDEN);
 * SELECT cell FROM crsql_unpack_columns WHERE package = ___;
 */

pub fn create_module(db: *mut sqlite::sqlite3) -> Result<ResultCode, ResultCode> {
    let module = Box::new(sqlite_nostd::module {
        iVersion: 0,
        xCreate: None,
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
    });
    db.create_module_v2("crsql_unpack_columns", Box::into_raw(module), None, None)?;

    Ok(ResultCode::OK)
}
