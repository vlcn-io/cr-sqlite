extern crate alloc;

use core::ffi::c_int;
use core::ptr::null_mut;
use core::slice;

use alloc::ffi::CString;
use sqlite::{ColumnType, Value};
use sqlite_nostd as sqlite;
use sqlite_nostd::ResultCode;

use crate::c::{crsql_Changes_cursor, crsql_Changes_vtab, crsql_mergeInsert};

extern "C" fn rowid(cursor: *mut sqlite::vtab_cursor, rowid: *mut sqlite::int64) -> c_int {
    let cursor = cursor.cast::<crsql_Changes_cursor>();
    unsafe {
        *rowid = crsql_slab_rowid((*cursor).tblInfoIdx, (*cursor).changesRowid);
        if *rowid < 0 {
            return ResultCode::ERROR as c_int;
        }
    }
    return ResultCode::OK as c_int;
}

extern "C" fn update(
    vtab: *mut sqlite::vtab,
    argc: c_int,
    argv: *mut *mut sqlite::value,
    row_id: *mut sqlite::int64,
) -> c_int {
    let args = sqlite::args!(argc, argv);
    let arg = args[0];
    if args.len() > 1 && arg.value_type() == ColumnType::Null {
        // insert statement
        // argv[1] is the rowid.. but why would it ever be filled for us?
        let mut err_msg = null_mut();
        let rc = unsafe { crsql_mergeInsert(vtab, argc, argv, row_id, &mut err_msg as *mut _) };
        if rc != ResultCode::OK as c_int {
            unsafe {
                (*vtab).zErrMsg = err_msg;
            }
        }
        return rc;
    } else {
        if let Ok(err) = CString::new(
            "Only INSERT and SELECT statements are allowed against the crsql changes table",
        ) {
            unsafe {
                (*vtab).zErrMsg = err.into_raw();
            }
            return ResultCode::MISUSE as c_int;
        } else {
            return ResultCode::NOMEM as c_int;
        }
    }
}

// If xBegin is not defined xCommit is not called.
extern "C" fn begin(vtab: *mut sqlite::vtab) -> c_int {
    ResultCode::OK as c_int
}

extern "C" fn commit(vtab: *mut sqlite::vtab) -> c_int {
    let tab = vtab.cast::<crsql_Changes_vtab>();
    unsafe {
        (*(*tab).pExtData).rowsImpacted = 0;
    }
    ResultCode::OK as c_int
}

static MODULE: sqlite_nostd::module = sqlite_nostd::module {
    iVersion: 0,
    xCreate: None,
    xConnect: None,    //Some(connect),
    xBestIndex: None,  //Some(best_index),
    xDisconnect: None, //Some(disconnect),
    xDestroy: None,
    xOpen: None,   //Some(open),
    xClose: None,  //Some(close),
    xFilter: None, //Some(filter),
    xNext: None,   //Some(next),
    xEof: None,    //Some(eof),
    xColumn: None, //Some(column),
    xRowid: Some(rowid),
    xUpdate: Some(update),
    xBegin: Some(begin),
    xSync: None,
    xCommit: Some(commit),
    xRollback: None,
    xFindFunction: None,
    xRename: None,
    xSavepoint: None,
    xRelease: None,
    xRollbackTo: None,
    xShadowName: None,
};
