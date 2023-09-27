use core::ffi::{c_char, c_int};
use core::mem::ManuallyDrop;

use crate::alloc::string::ToString;
use crate::c::crsql_ExtData;
use crate::stmt_cache::reset_cached_stmt;
use alloc::boxed::Box;
use alloc::format;
use alloc::slice;
use alloc::string::String;
use alloc::vec::Vec;
use sqlite::sqlite3;
use sqlite::{value, Context, ManagedStmt, Value};
use sqlite_nostd as sqlite;
use sqlite_nostd::ResultCode;

use crate::tableinfo::{crsql_ensure_table_infos_are_up_to_date, TableInfo};

mod after_insert;
mod after_update;

pub fn trigger_fn_preamble<F>(
    ctx: *mut sqlite::context,
    argc: c_int,
    argv: *mut *mut sqlite::value,
    f: F,
) -> Result<ResultCode, String>
where
    F: Fn(&TableInfo, &[*mut sqlite::value], *mut crsql_ExtData) -> Result<ResultCode, String>,
{
    if argc < 1 {
        return Err("expected at least 1 argument".to_string());
    }

    let values = sqlite::args!(argc, argv);
    let ext_data = sqlite::user_data(ctx) as *mut crsql_ExtData;
    let mut inner_err: *mut c_char = core::ptr::null_mut();
    let outer_err: *mut *mut c_char = &mut inner_err;

    let rc = crsql_ensure_table_infos_are_up_to_date(ctx.db_handle(), ext_data, outer_err);
    if rc != ResultCode::OK as c_int {
        return Err(format!(
            "failed to ensure table infos are up to date: {}",
            rc
        ));
    }

    let table_infos =
        unsafe { ManuallyDrop::new(Box::from_raw((*ext_data).tableInfos as *mut Vec<TableInfo>)) };
    let table_name = values[0].text();
    let table_info = match table_infos.iter().find(|t| &(t.tbl_name) == table_name) {
        Some(t) => t,
        None => {
            return Err(format!("table {} not found", table_name));
        }
    };

    f(table_info, &values, ext_data)
}

fn step_trigger_stmt(stmt: &ManagedStmt) -> Result<ResultCode, String> {
    match stmt.step() {
        Ok(ResultCode::DONE) => {
            reset_cached_stmt(stmt.stmt)
                .or_else(|_e| Err("done -- unable to reset cached trigger stmt"))?;
            Ok(ResultCode::OK)
        }
        Ok(code) | Err(code) => {
            reset_cached_stmt(stmt.stmt)
                .or_else(|_e| Err("error -- unable to reset cached trigger stmt"))?;
            Err(format!(
                "unexpected result code from tigger_stmt.step: {}",
                code
            ))
        }
    }
}

fn mark_new_pk_row_created(
    db: *mut sqlite3,
    tbl_info: &TableInfo,
    pks_new: &[*mut value],
    db_version: i64,
    seq: i32,
) -> Result<ResultCode, String> {
    let mark_locally_created_stmt_ref = tbl_info
        .get_mark_locally_created_stmt(db)
        .or_else(|_e| Err("failed to get mark_locally_created_stmt"))?;
    let mark_locally_created_stmt = mark_locally_created_stmt_ref
        .as_ref()
        .ok_or("Failed to deref sentinel stmt")?;

    for (i, pk) in pks_new.iter().enumerate() {
        mark_locally_created_stmt
            .bind_value(i as i32 + 1, *pk)
            .or_else(|_e| Err("failed to bind pks to mark_locally_created_stmt"))?;
    }
    mark_locally_created_stmt
        .bind_int64(pks_new.len() as i32 + 1, db_version)
        .and_then(|_| mark_locally_created_stmt.bind_int(pks_new.len() as i32 + 2, seq))
        .and_then(|_| mark_locally_created_stmt.bind_int64(pks_new.len() as i32 + 3, db_version))
        .and_then(|_| mark_locally_created_stmt.bind_int(pks_new.len() as i32 + 4, seq))
        .or_else(|_| Err("failed binding to mark_locally_created_stmt"))?;
    step_trigger_stmt(mark_locally_created_stmt)
}
