extern crate alloc;
use alloc::vec::Vec;
use core::ffi::c_void;
use core::mem::forget;
use core::mem::ManuallyDrop;
use core::ptr::null_mut;

use alloc::boxed::Box;
use alloc::collections::BTreeMap;
use alloc::format;
use alloc::string::String;
use alloc::string::ToString;
use sqlite::Stmt;
use sqlite_nostd as sqlite;
use sqlite_nostd::ResultCode;

use crate::c::crsql_ExtData;
use crate::tableinfo::TableInfo;

#[no_mangle]
pub extern "C" fn crsql_init_stmt_cache(ext_data: *mut crsql_ExtData) {
    let map: BTreeMap<String, *mut sqlite::stmt> = BTreeMap::new();
    unsafe {
        (*ext_data).pStmtCache = Box::into_raw(Box::new(map)) as *mut c_void;
    }
}

#[no_mangle]
pub extern "C" fn crsql_clear_stmt_cache(ext_data: *mut crsql_ExtData) {
    if unsafe { (*ext_data).pStmtCache.is_null() } {
        return;
    }
    let map: Box<BTreeMap<String, *mut sqlite::stmt>> = unsafe {
        Box::from_raw((*ext_data).pStmtCache as *mut BTreeMap<String, *mut sqlite::stmt>)
    };
    for (_key, stmt) in map.iter() {
        let _ = stmt.finalize();
    }
    unsafe {
        (*ext_data).pStmtCache = null_mut();
    }

    let tbl_infos =
        unsafe { ManuallyDrop::new(Box::from_raw((*ext_data).tableInfos as *mut Vec<TableInfo>)) };
    for tbl_info in tbl_infos.iter() {
        tbl_info.clear_stmts();
    }
    // The new stuff --- finalize tbl info stmts
}

pub fn reset_cached_stmt(stmt: *mut sqlite::stmt) -> Result<ResultCode, ResultCode> {
    if stmt.is_null() {
        return Ok(ResultCode::OK);
    }
    stmt.clear_bindings()?;
    stmt.reset()
}
