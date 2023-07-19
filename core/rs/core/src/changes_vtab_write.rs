use alloc::ffi::CString;
use alloc::format;
use alloc::vec::Vec;
use core::ffi::{c_char, c_int, c_void, CStr};
use core::mem::forget;
use core::ptr::null_mut;
use sqlite::{Connection, Stmt};
use sqlite_nostd as sqlite;
use sqlite_nostd::{sqlite3, ResultCode};

use crate::c::{
    crsql_getCacheKeyForStmtType, crsql_getCachedStmt, crsql_resetCachedStmt, crsql_setCachedStmt,
    CachedStmtType,
};
use crate::compare_values::crsql_compare_sqlite_values;
use crate::pack_columns::bind_package_to_stmt;
use crate::ColumnValue;
use crate::{c::crsql_ExtData, pack_columns::RawVec};

/**
 * We can make this more idiomatic once we have no more c callers of this method.
 * Slowly moving up the stack converting all the callers to Rust
 */
#[no_mangle]
pub unsafe extern "C" fn crsql_did_cid_win(
    db: *mut sqlite3,
    ext_data: *mut crsql_ExtData,
    insert_tbl: *const c_char,
    pk_where_list: *const c_char,
    unpacked_pks: RawVec,
    col_name: *const c_char,
    insert_val: *mut sqlite::value,
    col_version: sqlite::int64,
    errmsg: *mut *mut c_char,
) -> c_int {
    match did_cid_win(
        db,
        ext_data,
        insert_tbl,
        pk_where_list,
        unpacked_pks,
        col_name,
        insert_val,
        col_version,
        errmsg,
    ) {
        Ok(did_win) => {
            if did_win {
                1
            } else {
                0
            }
        }
        Err(_) => -1,
    }
}

unsafe fn did_cid_win(
    db: *mut sqlite3,
    ext_data: *mut crsql_ExtData,
    insert_tbl: *const c_char,
    pk_where_list: *const c_char,
    raw_pks: RawVec,
    col_name: *const c_char,
    insert_val: *mut sqlite::value,
    col_version: sqlite::int64,
    errmsg: *mut *mut c_char,
) -> Result<bool, ResultCode> {
    let insert_tbl_str = CStr::from_ptr(insert_tbl).to_str()?;
    let col_name_str = CStr::from_ptr(col_name).to_str()?;
    let pk_where_list = CStr::from_ptr(pk_where_list).to_str()?;

    let stmt_key =
        crsql_getCacheKeyForStmtType(CachedStmtType::GetColVersion as i32, insert_tbl, null_mut());
    if stmt_key.is_null() {
        let err = CString::new("Failed creating cache key for CACHED_STMT_GET_COL_VERSION")?;
        *errmsg = err.into_raw();
        return Err(ResultCode::ERROR);
    }
    let mut col_vrsn_stmt = crsql_getCachedStmt(ext_data, stmt_key);
    if col_vrsn_stmt.is_null() {
        let stmt = db.prepare_v3(
          &format!(
            "SELECT __crsql_col_version FROM \"{table_name}__crsql_clock\" WHERE {pk_where_list} AND ? = __crsql_col_name",
            table_name = crate::util::escape_ident(insert_tbl_str),
            pk_where_list = pk_where_list,
          ),
          sqlite::PREPARE_PERSISTENT
        );
        if let Ok(stmt) = stmt {
            crsql_setCachedStmt(ext_data, stmt_key, stmt.stmt);
            col_vrsn_stmt = stmt.stmt;
            forget(stmt);
        } else {
            sqlite::free(stmt_key as *mut c_void);
        }
    } else {
        sqlite::free(stmt_key as *mut c_void);
    }

    let unpacked_pks = Vec::from_raw_parts(
        raw_pks.ptr as *mut ColumnValue,
        raw_pks.len as usize,
        raw_pks.cap as usize,
    );
    let bind_result = bind_package_to_stmt(col_vrsn_stmt, &unpacked_pks);
    let unpacked_pks_len = unpacked_pks.len();
    // c owns this memory currently. forget it in rust land.
    forget(unpacked_pks);
    if let Err(rc) = bind_result {
        crsql_resetCachedStmt(col_vrsn_stmt);
        return Err(rc);
    }
    if let Err(rc) = col_vrsn_stmt.bind_text(
        unpacked_pks_len as i32 + 1,
        col_name_str,
        sqlite::Destructor::STATIC,
    ) {
        crsql_resetCachedStmt(col_vrsn_stmt);
        return Err(rc);
    }

    match col_vrsn_stmt.step() {
        Ok(ResultCode::ROW) => {
            let local_version = col_vrsn_stmt.column_int64(0);
            crsql_resetCachedStmt(col_vrsn_stmt);
            if col_version > local_version {
                return Ok(true);
            } else if col_version < local_version {
                return Ok(false);
            }
        }
        Ok(ResultCode::DONE) => {
            crsql_resetCachedStmt(col_vrsn_stmt);
            // no rows returned
            // of course the incoming change wins if there's nothing there locally.
            return Ok(true);
        }
        Ok(rc) | Err(rc) => {
            crsql_resetCachedStmt(col_vrsn_stmt);
            let err = CString::new("Bad return code when selecting local column version")?;
            *errmsg = err.into_raw();
            return Err(rc);
        }
    }

    // versions are equal
    // need to pull the current value and compare
    // we could compare on site_id if we can guarantee site_id is always provided.
    // would be slightly more performant..
    let stmt_key =
        crsql_getCacheKeyForStmtType(CachedStmtType::GetCurrValue as i32, insert_tbl, col_name);
    if stmt_key.is_null() {
        let err = CString::new("Failed creating cache key for CACHED_STMT_GET_CURR_VALUE")?;
        *errmsg = err.into_raw();
        return Err(ResultCode::ERROR);
    }
    let mut col_val_stmt = crsql_getCachedStmt(ext_data, stmt_key);
    if col_val_stmt.is_null() {
        let stmt = db.prepare_v3(
            &format!(
                "SELECT \"{col_name}\" FROM \"{table_name}\" WHERE {pk_where_list}",
                col_name = crate::util::escape_ident(col_name_str),
                table_name = crate::util::escape_ident(insert_tbl_str),
                pk_where_list = pk_where_list,
            ),
            sqlite::PREPARE_PERSISTENT,
        );
        if let Ok(stmt) = stmt {
            crsql_setCachedStmt(ext_data, stmt_key, stmt.stmt);
            col_val_stmt = stmt.stmt;
            forget(stmt);
        } else {
            sqlite::free(stmt_key as *mut c_void);
        }
    } else {
        sqlite::free(stmt_key as *mut c_void);
    }

    let unpacked_pks = Vec::from_raw_parts(
        raw_pks.ptr as *mut ColumnValue,
        raw_pks.len as usize,
        raw_pks.cap as usize,
    );
    let bind_result = bind_package_to_stmt(col_val_stmt, &unpacked_pks);
    // c owns this memory currently. forget it in rust land.
    forget(unpacked_pks);

    if let Err(rc) = bind_result {
        crsql_resetCachedStmt(col_val_stmt);
        return Err(rc);
    }

    let step_result = col_val_stmt.step();
    match step_result {
        Ok(ResultCode::ROW) => {
            let local_value = col_val_stmt.column_value(0);
            let ret = crsql_compare_sqlite_values(insert_val, local_value);
            crsql_resetCachedStmt(col_val_stmt);
            return Ok(ret > 0);
        }
        _ => {
            // ResultCode::DONE would happen if clock values exist but actual values are missing.
            // should we just allow the insert anyway?
            let err = CString::new(format!(
                "could not find row to merge with for tbl {}",
                insert_tbl_str
            ))?;
            *errmsg = err.into_raw();
            crsql_resetCachedStmt(col_val_stmt);
            return Err(ResultCode::ERROR);
        }
    }
}

pub extern "C" fn crsql_check_for_local_delete() -> c_int {}
