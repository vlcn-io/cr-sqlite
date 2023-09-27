use alloc::string::String;
use core::ffi::c_int;
use sqlite::sqlite3;
use sqlite::value;
use sqlite::Context;
use sqlite::ResultCode;
use sqlite_nostd as sqlite;

use crate::{c::crsql_ExtData, tableinfo::TableInfo};

use super::bump_seq;
use super::trigger_fn_preamble;

/**
 * crsql_after_insert("table", pk_values...)
 */
#[no_mangle]
pub unsafe extern "C" fn crsql_after_insert(
    ctx: *mut sqlite::context,
    argc: c_int,
    argv: *mut *mut sqlite::value,
) {
    let result = trigger_fn_preamble(ctx, argc, argv, |table_info, values, ext_data| {
        after_insert(ctx.db_handle(), ext_data, table_info, &values[1..])
    });

    match result {
        Ok(_) => {
            ctx.result_int64(0);
        }
        Err(msg) => {
            ctx.result_error(&msg);
        }
    }
}

fn after_insert(
    db: *mut sqlite3,
    ext_data: *mut crsql_ExtData,
    tbl_info: &TableInfo,
    pks_new: &[*mut value],
) -> Result<ResultCode, String> {
    let db_version = crate::db_version::next_db_version(db, ext_data, None)?;
    if tbl_info.non_pks.len() == 0 {
        let seq = bump_seq(ext_data);
        // just a sentinel record
        return super::mark_new_pk_row_created(db, tbl_info, pks_new, db_version, seq);
    } else {
        // update the create record if it exists
        update_create_record_if_exists(db, tbl_info, pks_new, db_version)?;
    }

    // now for each non-pk column, create or update the column record
    for col in tbl_info.non_pks.iter() {
        let seq = bump_seq(ext_data);
        super::mark_locally_updated(db, tbl_info, pks_new, col, db_version, seq)?;
    }
    Ok(ResultCode::OK)
}

fn update_create_record_if_exists(
    db: *mut sqlite3,
    tbl_info: &TableInfo,
    pks_new: &[*mut value],
    db_version: i64,
) -> Result<ResultCode, String> {
    let update_create_record_stmt_ref = tbl_info
        .get_maybe_mark_locally_reinserted_stmt(db)
        .or_else(|_e| Err("failed to get update_create_record_stmt"))?;
    let update_create_record_stmt = update_create_record_stmt_ref
        .as_ref()
        .ok_or("Failed to deref update_create_record_stmt")?;

    update_create_record_stmt
        .bind_int64(1, db_version)
        .or_else(|_e| Err("failed binding to update_create_record_stmt"))?;

    for (i, pk) in pks_new.iter().enumerate() {
        update_create_record_stmt
            .bind_value(i as i32 + 2, *pk)
            .or_else(|_e| Err("failed to bind pks to update_create_record_stmt"))?;
    }

    update_create_record_stmt
        .bind_text(
            pks_new.len() as i32 + 2,
            crate::c::INSERT_SENTINEL,
            sqlite::Destructor::STATIC,
        )
        .or_else(|_e| Err("failed to bind sentinel to update_create_record_stmt"))?;
    super::step_trigger_stmt(update_create_record_stmt)
}
