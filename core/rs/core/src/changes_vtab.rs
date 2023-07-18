extern crate alloc;
use alloc::format;
use core::ffi::{c_char, c_int};
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

/**
 * Advances our Changes_cursor to its next row of output.
 * TODO: this'll get more idiomatic as we move dependencies to Rust
 */
unsafe extern "C" fn next(cursor: *mut sqlite::vtab_cursor) -> c_int {
    let cursor = cursor.cast::<crsql_Changes_cursor>();
    let vtab = (*cursor).pTab.cast::<sqlite::vtab>();

    if (*cursor).pChangesStmt.is_null() {
        if let Ok(err) = CString::new("pChangesStmt is null in changes_next") {
            (*vtab).zErrMsg = err.into_raw();
            return ResultCode::ABORT as c_int;
        }
        return ResultCode::NOMEM as c_int;
    }

    if !(*cursor).pRowStmt.is_null() {
        let rc = crate::c::crsql_resetCachedStmt((*cursor).pRowStmt);
        (*cursor).pRowStmt = null_mut();
        if rc != 0 {
            return rc;
        }
    }

    let rc = (*cursor).pChangesStmt.step();
    match rc {
        Err(rc) => {
            changes_crsr_finalize(cursor);
            return rc as c_int;
        }
        Ok(ResultCode::DONE) => return changes_crsr_finalize(cursor),
        _ => {
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
                if let Ok(err) = CString::new(format!("could not find schema for table {}", tbl)) {
                    (*vtab).zErrMsg = err.into_raw();
                    return ResultCode::ERROR as c_int;
                }
                return ResultCode::NOMEM as c_int;
            }

            let tbl_info =
                (*(*(*(*cursor).pTab).pExtData).zpTableInfos).offset(tbl_info_index as isize);
            (*cursor).changesRowid = changes_rowid;
            (*cursor).tblInfoIdx = tbl_info_index;

            if (*tbl_info).pksLen == 0 {
                if let Ok(err) = CString::new(format!("crr {} is missing primary keys", tbl)) {
                    (*vtab).zErrMsg = err.into_raw();
                    return ResultCode::ERROR as c_int;
                }
                return ResultCode::NOMEM as c_int;
            }

            if cid == crate::c::DELETE_SENTINEL {
                (*cursor).rowType = ChangeRowType::Delete as c_int;
            } else if cid == crate::c::INSERT_SENTINEL {
                (*cursor).rowType = ChangeRowType::PkOnly as c_int;
            } else {
                (*cursor).rowType = ChangeRowType::Update as c_int;
            }

            // let row_stmt = (*cursor).pRowStmt;
            // let stmt_key = crsql_getCacheKeyForStmtType();

            return 0;
        }
    }
}
// static int changesNext(sqlite3_vtab_cursor *cur) {

//   sqlite3_stmt *pRowStmt = pCur->pRowStmt;
//   // CACHED_STMT_ROW_PATCH_DATA
//   char *zStmtKey = crsql_getCacheKeyForStmtType(CACHED_STMT_ROW_PATCH_DATA,
//                                                 tblInfo->tblName, cid);
//   pRowStmt = crsql_getCachedStmt(pCur->pTab->pExtData, zStmtKey);
//   if (pRowStmt == 0) {
//     char *zSql = crsql_row_patch_data_query(tblInfo, cid);
//     if (zSql == 0) {
//       pTabBase->zErrMsg = sqlite3_mprintf(
//           "crsql internal error generationg raw data fetch query for table "
//           "%s",
//           tbl);
//       return SQLITE_ERROR;
//     }

//     rc = sqlite3_prepare_v3(pCur->pTab->db, zSql, -1, SQLITE_PREPARE_PERSISTENT,
//                             &pRowStmt, 0);
//     sqlite3_free(zSql);

//     if (rc != SQLITE_OK) {
//       pTabBase->zErrMsg = sqlite3_mprintf(
//           "crsql internal error preparing row data fetch statement");
//       sqlite3_finalize(pRowStmt);
//       return rc;
//     }
//     crsql_setCachedStmt(pCur->pTab->pExtData, zStmtKey, pRowStmt);
//   } else {
//     sqlite3_free(zStmtKey);
//   }

//   RawVec unpackedPks = crsql_unpack_columns(pks);
//   if (unpackedPks.ptr == 0) {
//     pTabBase->zErrMsg = sqlite3_mprintf("unable to unpack primary keys");
//     return unpackedPks.len;
//   }
//   rc = crsql_bind_unpacked_values(pRowStmt, unpackedPks);
//   if (rc != SQLITE_OK) {
//     crsql_resetCachedStmt(pRowStmt);
//     crsql_free_unpacked_values(unpackedPks);
//     pTabBase->zErrMsg = sqlite3_mprintf(
//         "crsql internal error preparing row data fetch statement");
//     return rc;
//   }

//   rc = sqlite3_step(pRowStmt);
//   crsql_free_unpacked_values(unpackedPks);
//   if (rc != SQLITE_ROW) {
//     crsql_resetCachedStmt(pRowStmt);
//     // getting 0 rows for something we have clock entries for is not an
//     // error it could just be the case that the thing was deleted so we have
//     // nothing to retrieve to fill in values for do we re-write cids in this
//     // case?
//     if (rc == SQLITE_DONE) {
//       return SQLITE_OK;
//     }
//     pTabBase->zErrMsg =
//         sqlite3_mprintf("crsql internal error fetching row data");
//     return SQLITE_ERROR;
//   } else {
//     rc = SQLITE_OK;
//   }

//   pCur->pRowStmt = pRowStmt;

//   return rc;
// }

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
    xNext: Some(next),
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
