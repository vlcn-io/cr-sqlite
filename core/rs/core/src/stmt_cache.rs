extern crate alloc;
use alloc::ffi::CString;
use alloc::format;
use alloc::string::ToString;
use sqlite_nostd as sqlite;
use sqlite_nostd::ResultCode;

use crate::c::{crsql_ExtData, crsql_setCachedStmt};

// port the stmt cache so we can
// - start removing some unsafe code
// - remove uthash and just use rust btreemap
pub enum CachedStmtType {
    SetWinnerClock = 0,
    CheckForLocalDelete = 1,
    GetColVersion = 2,
    GetCurrValue = 3,
    MergePkOnlyInsert = 4,
    MergeDelete = 5,
    MergeInsert = 6,
    RowPatchData = 7,
}

pub fn get_cache_key(
    stmt_type: CachedStmtType,
    tbl_name: &str,
    col_name: Option<&str>,
) -> Result<CString, ResultCode> {
    match stmt_type {
        CachedStmtType::SetWinnerClock
        | CachedStmtType::CheckForLocalDelete
        | CachedStmtType::GetColVersion
        | CachedStmtType::MergePkOnlyInsert
        | CachedStmtType::MergeDelete => {
            if col_name.is_some() {
                // col name should not be specified for these cases
                return Err(ResultCode::MISUSE);
            }
            Ok(CString::new(format!(
                "{stmt_type}_{tbl_name}",
                stmt_type = (stmt_type as i32).to_string(),
                tbl_name = tbl_name
            ))?)
        }
        CachedStmtType::GetCurrValue
        | CachedStmtType::MergeInsert
        | CachedStmtType::RowPatchData => {
            if let Some(col_name) = col_name {
                Ok(CString::new(format!(
                    "{stmt_type}_{tbl_name}_{col_name}",
                    stmt_type = (stmt_type as i32).to_string(),
                    tbl_name = tbl_name,
                    col_name = col_name
                ))?)
            } else {
                // col_name must be specified in this case
                Err(ResultCode::MISUSE)
            }
        }
    }
}

#[inline]
pub fn set_cached_stmt(ext_data: *mut crsql_ExtData, key: CString, stmt: *mut sqlite::stmt) {
    // give ownership of the key to C
    unsafe { crsql_setCachedStmt(ext_data, key.into_raw(), stmt) };
}
