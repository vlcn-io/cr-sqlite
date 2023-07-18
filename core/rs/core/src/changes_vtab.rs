extern crate alloc;
use alloc::format;
use core::ffi::{c_char, c_int, c_void, CStr};
use core::mem::forget;
use core::ptr::null_mut;
use core::slice;

use alloc::ffi::CString;
#[cfg(not(feature = "std"))]
use num_traits::FromPrimitive;
use sqlite::{ColumnType, Connection, Context, Stmt, Value};
use sqlite_nostd as sqlite;
use sqlite_nostd::ResultCode;

use crate::c::{
    crsql_Changes_cursor, crsql_Changes_vtab, crsql_ensureTableInfosAreUpToDate,
    crsql_getCacheKeyForStmtType, crsql_getCachedStmt, crsql_mergeInsert, crsql_resetCachedStmt,
    crsql_setCachedStmt, ChangeRowType, ClockUnionColumn, CrsqlChangesColumn,
};
use crate::changes_vtab_read::{changes_union_query, row_patch_data_query};
use crate::pack_columns::bind_package_to_stmt;
use crate::unpack_columns;

fn changes_crsr_finalize(crsr: *mut crsql_Changes_cursor) -> c_int {
    // Assign pointers to null after freeing
    // since we can get into this twice for the same cursor object.
    unsafe {
        let mut rc = 0;
        rc += match (*crsr).pChangesStmt.finalize() {
            Ok(rc) => rc as c_int,
            Err(rc) => rc as c_int,
        };
        (*crsr).pChangesStmt = null_mut();
        rc += crate::c::crsql_resetCachedStmt((*crsr).pRowStmt);
        (*crsr).pRowStmt = null_mut();
        (*crsr).dbVersion = crate::consts::MIN_POSSIBLE_DB_VERSION;

        return rc;
    }
}

// This'll become safe once more code is moved over to Rust
#[no_mangle]
pub unsafe extern "C" fn crsql_changes_filter(
    cursor: *mut sqlite::vtab_cursor,
    _idx_num: c_int,
    idx_str: *const c_char,
    argc: c_int,
    argv: *mut *mut sqlite::value,
) -> c_int {
    let args = sqlite::args!(argc, argv);
    let cursor = cursor.cast::<crsql_Changes_cursor>();
    let idx_str = unsafe { CStr::from_ptr(idx_str).to_str() };
    match idx_str {
        Ok(idx_str) => match changes_filter(cursor, idx_str, args) {
            Err(rc) | Ok(rc) => rc as c_int,
        },
        Err(_) => ResultCode::FORMAT as c_int,
    }
}

unsafe fn changes_filter(
    cursor: *mut crsql_Changes_cursor,
    idx_str: &str,
    args: &[*mut sqlite::value],
) -> Result<ResultCode, ResultCode> {
    let tab = (*cursor).pTab;
    let db = (*tab).db;
    // This should never happen. pChangesStmt should be finalized
    // before filter is ever invoked.
    if !(*cursor).pChangesStmt.is_null() {
        (*cursor).pChangesStmt.finalize()?;
        (*cursor).pChangesStmt = null_mut();
    }

    let c_rc =
        crsql_ensureTableInfosAreUpToDate(db, (*tab).pExtData, &mut (*tab).base.zErrMsg as *mut _);
    if c_rc != 0 {
        if let Some(rc) = ResultCode::from_i32(c_rc) {
            return Err(rc);
        } else {
            return Err(ResultCode::ERROR);
        }
    }

    // nothing to fetch, no crrs exist.
    if (*(*tab).pExtData).tableInfosLen == 0 {
        return Ok(ResultCode::OK);
    }

    let table_infos = sqlite::args!(
        (*(*tab).pExtData).tableInfosLen,
        (*(*tab).pExtData).zpTableInfos
    );
    let sql = changes_union_query(table_infos, idx_str)?;

    let stmt = db.prepare_v2(&sql)?;
    for (i, arg) in args.iter().enumerate() {
        stmt.bind_value(i as i32 + 1, *arg)?;
    }
    (*cursor).pChangesStmt = stmt.stmt;
    // forget the stmt. it will be managed by the vtab
    forget(stmt);
    changes_next(cursor, (*cursor).pTab.cast::<sqlite::vtab>())
}

/**
 * Advances our Changes_cursor to its next row of output.
 * TODO: this'll get more idiomatic as we move dependencies to Rust
 */
#[no_mangle]
pub unsafe extern "C" fn crsql_changes_next(cursor: *mut sqlite::vtab_cursor) -> c_int {
    let cursor = cursor.cast::<crsql_Changes_cursor>();
    let vtab = (*cursor).pTab.cast::<sqlite::vtab>();
    match changes_next(cursor, vtab) {
        Ok(rc) => rc as c_int,
        Err(rc) => {
            changes_crsr_finalize(cursor);
            rc as c_int
        }
    }
}

// We'll get more idiomatic once we have more Rust and less C
unsafe fn changes_next(
    cursor: *mut crsql_Changes_cursor,
    vtab: *mut sqlite::vtab,
) -> Result<ResultCode, ResultCode> {
    if (*cursor).pChangesStmt.is_null() {
        let err = CString::new("pChangesStmt is null in changes_next")?;
        (*vtab).zErrMsg = err.into_raw();
        return Err(ResultCode::ABORT);
    }

    if !(*cursor).pRowStmt.is_null() {
        let rc = crate::c::crsql_resetCachedStmt((*cursor).pRowStmt);
        (*cursor).pRowStmt = null_mut();
        if rc != 0 {
            return Err(ResultCode::ERROR);
        }
    }

    let rc = (*cursor).pChangesStmt.step()?;
    if rc == ResultCode::DONE {
        let c_rc = changes_crsr_finalize(cursor);
        if c_rc == 0 {
            return Ok(ResultCode::OK);
        } else {
            return Err(ResultCode::ERROR);
        }
    }

    // we had a row... we can do the rest
    let tbl = (*cursor)
        .pChangesStmt
        .column_text(ClockUnionColumn::Tbl as i32);
    let pks = (*cursor)
        .pChangesStmt
        .column_value(ClockUnionColumn::Pks as i32);
    let cid = (*cursor)
        .pChangesStmt
        .column_text(ClockUnionColumn::Cid as i32);
    let db_version = (*cursor)
        .pChangesStmt
        .column_int64(ClockUnionColumn::DbVrsn as i32);
    let changes_rowid = (*cursor)
        .pChangesStmt
        .column_int64(ClockUnionColumn::RowId as i32);
    (*cursor).dbVersion = db_version;

    let tbl_info_index = crate::c::crsql_indexofTableInfo(
        (*(*(*cursor).pTab).pExtData).zpTableInfos,
        (*(*(*cursor).pTab).pExtData).tableInfosLen,
        tbl.as_ptr() as *const c_char,
    );

    if tbl_info_index < 0 {
        let err = CString::new(format!("could not find schema for table {}", tbl))?;
        (*vtab).zErrMsg = err.into_raw();
        return Err(ResultCode::ERROR);
    }

    let tbl_infos = sqlite::args!(
        (*(*(*cursor).pTab).pExtData).tableInfosLen,
        (*(*(*cursor).pTab).pExtData).zpTableInfos
    );
    let tbl_info = tbl_infos[tbl_info_index as usize];
    (*cursor).changesRowid = changes_rowid;
    (*cursor).tblInfoIdx = tbl_info_index;

    if (*tbl_info).pksLen == 0 {
        let err = CString::new(format!("crr {} is missing primary keys", tbl))?;
        (*vtab).zErrMsg = err.into_raw();
        return Err(ResultCode::ERROR);
    }

    if cid == crate::c::DELETE_SENTINEL {
        (*cursor).rowType = ChangeRowType::Delete as c_int;
        return Ok(ResultCode::OK);
    } else if cid == crate::c::INSERT_SENTINEL {
        (*cursor).rowType = ChangeRowType::PkOnly as c_int;
        return Ok(ResultCode::OK);
    } else {
        (*cursor).rowType = ChangeRowType::Update as c_int;
    }

    let stmt_key = crsql_getCacheKeyForStmtType(
        crate::c::CachedStmtType::RowPatchData as i32,
        (*tbl_info).tblName,
        cid.as_ptr() as *const c_char,
    );
    let mut row_stmt = crsql_getCachedStmt((*(*cursor).pTab).pExtData, stmt_key);
    if row_stmt.is_null() {
        let sql = row_patch_data_query(tbl_info, cid);
        if let Some(sql) = sql {
            let stmt = (*(*cursor).pTab)
                .db
                .prepare_v3(&sql, sqlite::PREPARE_PERSISTENT)?;
            // the cache takes ownership of stmt and stmt_key
            crsql_setCachedStmt((*(*cursor).pTab).pExtData, stmt_key, stmt.stmt);
            row_stmt = stmt.stmt;
            forget(stmt);
        } else {
            let err = CString::new(format!(
                "could not generate row data fetch query for {}",
                tbl
            ))?;
            (*vtab).zErrMsg = err.into_raw();
            sqlite::free(stmt_key as *mut c_void);
            return Err(ResultCode::ERROR);
        }
    } else {
        sqlite::free(stmt_key as *mut c_void);
    }

    let packed_pks = pks.blob();
    let unpacked_pks = unpack_columns(packed_pks)?;
    bind_package_to_stmt(row_stmt, &unpacked_pks)?;

    match row_stmt.step() {
        Ok(ResultCode::DONE) => {
            crsql_resetCachedStmt(row_stmt);
        }
        Ok(_) => {}
        Err(rc) => {
            crsql_resetCachedStmt(row_stmt);
            return Err(rc);
        }
    }

    (*cursor).pRowStmt = row_stmt;
    Ok(ResultCode::OK)
}

#[no_mangle]
pub extern "C" fn crsql_changes_eof(cursor: *mut sqlite::vtab_cursor) -> c_int {
    let cursor = cursor.cast::<crsql_Changes_cursor>();
    if unsafe { (*cursor).pChangesStmt.is_null() } {
        return 1;
    } else {
        return 0;
    }
}

#[no_mangle]
pub extern "C" fn crsql_changes_column(
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

#[no_mangle]
pub extern "C" fn crsql_changes_rowid(
    cursor: *mut sqlite::vtab_cursor,
    rowid: *mut sqlite::int64,
) -> c_int {
    let cursor = cursor.cast::<crsql_Changes_cursor>();
    unsafe {
        *rowid = crate::util::slab_rowid((*cursor).tblInfoIdx, (*cursor).changesRowid);
        if *rowid < 0 {
            return ResultCode::ERROR as c_int;
        }
    }
    return ResultCode::OK as c_int;
}

#[no_mangle]
pub extern "C" fn crsql_changes_update(
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
#[no_mangle]
pub extern "C" fn crsql_changes_begin(_vtab: *mut sqlite::vtab) -> c_int {
    ResultCode::OK as c_int
}

#[no_mangle]
pub extern "C" fn crsql_changes_commit(vtab: *mut sqlite::vtab) -> c_int {
    let tab = vtab.cast::<crsql_Changes_vtab>();
    unsafe {
        (*(*tab).pExtData).rowsImpacted = 0;
    }
    ResultCode::OK as c_int
}

// static MODULE: sqlite_nostd::module = sqlite_nostd::module {
//     iVersion: 0,
//     xCreate: None,
//     xConnect: None,    //Some(connect),
//     xBestIndex: None,  //Some(best_index),
//     xDisconnect: None, //Some(disconnect),
//     xDestroy: None,
//     xOpen: None,   //Some(open),
//     xClose: None,  //Some(close),
//     xFilter: None, //Some(filter),
//     xNext: Some(next),
//     xEof: Some(eof),
//     xColumn: Some(column),
//     xRowid: Some(rowid),
//     xUpdate: Some(update),
//     xBegin: Some(begin),
//     xSync: None,
//     xCommit: Some(commit),
//     xRollback: None,
//     xFindFunction: None,
//     xRename: None,
//     xSavepoint: None,
//     xRelease: None,
//     xRollbackTo: None,
//     xShadowName: None,
// };
