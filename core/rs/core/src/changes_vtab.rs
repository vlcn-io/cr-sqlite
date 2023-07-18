extern crate alloc;

use core::ffi::c_int;
use core::ptr::null_mut;
use core::slice;

use alloc::ffi::CString;
#[cfg(not(feature = "std"))]
use num_traits::FromPrimitive;
use sqlite::{ColumnType, Context, Stmt, Value};
use sqlite_nostd as sqlite;
use sqlite_nostd::ResultCode;

use crate::c::{
    crsql_Changes_cursor, crsql_Changes_vtab, crsql_mergeInsert, ChangeRowType, ClockUnionColumn,
    CrsqlChangesColumn,
};

extern "C" fn eof(cursor: *mut sqlite::vtab_cursor) -> c_int {
    let cursor = cursor.cast::<crsql_Changes_cursor>();
    if unsafe { (*cursor).pChangesStmt.is_null() } {
        return 1;
    } else {
        return 0;
    }
}

extern "C" fn column(
    cursor: *mut sqlite::vtab_cursor, /* The cursor */
    ctx: *mut sqlite::context,        /* First argument to sqlite3_result_...() */
    i: c_int,                         /* Which column to return */
) -> c_int {
    match column_impl(cursor, ctx, i) {
        Ok(code) | Err(code) => code as c_int,
    }
}

fn column_impl(
    cursor: *mut sqlite::vtab_cursor,
    ctx: *mut sqlite::context,
    i: c_int,
) -> Result<ResultCode, ResultCode> {
    let cursor = cursor.cast::<crsql_Changes_cursor>();
    let column = CrsqlChangesColumn::from_i32(i);
    // TODO: only de-reference where needed?
    let changes_stmt = unsafe { (*cursor).pChangesStmt };
    match column {
        Some(CrsqlChangesColumn::Tbl) => {
            ctx.result_value(changes_stmt.column_value(ClockUnionColumn::Tbl as i32));
        }
        Some(CrsqlChangesColumn::Pk) => {
            ctx.result_value(changes_stmt.column_value(ClockUnionColumn::Pks as i32));
        }
        Some(CrsqlChangesColumn::Cval) => unsafe {
            if (*cursor).pRowStmt.is_null() {
                ctx.result_null();
            } else {
                ctx.result_value((*cursor).pRowStmt.column_value(0));
            }
        },
        Some(CrsqlChangesColumn::Cid) => unsafe {
            let row_type = ChangeRowType::from_i32((*cursor).rowType);
            match row_type {
                Some(ChangeRowType::PkOnly) => ctx.result_text_static(crate::c::INSERT_SENTINEL),
                Some(ChangeRowType::Delete) => ctx.result_text_static(crate::c::DELETE_SENTINEL),
                Some(ChangeRowType::Update) => {
                    if (*cursor).pRowStmt.is_null() {
                        ctx.result_text_static(crate::c::DELETE_SENTINEL);
                    } else {
                        ctx.result_value(changes_stmt.column_value(ClockUnionColumn::Cid as i32));
                    }
                }
                None => return Err(ResultCode::ABORT),
            }
        },
        Some(CrsqlChangesColumn::ColVrsn) => {
            ctx.result_value(changes_stmt.column_value(ClockUnionColumn::ColVrsn as i32));
        }
        Some(CrsqlChangesColumn::DbVrsn) => {
            ctx.result_value(changes_stmt.column_value(ClockUnionColumn::DbVrsn as i32));
        }
        Some(CrsqlChangesColumn::SiteId) => {
            // todo: short circuit null? if col type null bind null rather than value?
            // sholdn't matter..
            ctx.result_value(changes_stmt.column_value(ClockUnionColumn::SiteId as i32));
        }
        Some(CrsqlChangesColumn::Seq) => {
            ctx.result_value(changes_stmt.column_value(ClockUnionColumn::Seq as i32));
        }
        None => return Err(ResultCode::MISUSE),
    }

    Ok(ResultCode::OK)
}

extern "C" fn rowid(cursor: *mut sqlite::vtab_cursor, rowid: *mut sqlite::int64) -> c_int {
    let cursor = cursor.cast::<crsql_Changes_cursor>();
    unsafe {
        *rowid = crate::util::slab_rowid((*cursor).tblInfoIdx, (*cursor).changesRowid);
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
    xEof: Some(eof),
    xColumn: Some(column),
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
