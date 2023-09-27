use alloc::string::String;
use core::ffi::c_int;
use sqlite::sqlite3;
use sqlite::value;
use sqlite::Context;
use sqlite::ResultCode;
use sqlite_nostd as sqlite;

use crate::db_version;
use crate::{c::crsql_ExtData, tableinfo::TableInfo};

use super::bump_seq;
use super::trigger_fn_preamble;

/**
 * crsql_after_delete("table", old_pk_values...)
 */
#[no_mangle]
pub unsafe extern "C" fn crsql_after_delete(
    ctx: *mut sqlite::context,
    argc: c_int,
    argv: *mut *mut sqlite::value,
) {
    let result = trigger_fn_preamble(ctx, argc, argv, |table_info, values, ext_data| {
        after_delete(ctx.db_handle(), ext_data, table_info, &values[1..])
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

fn after_delete(
    db: *mut sqlite3,
    ext_data: *mut crsql_ExtData,
    tbl_info: &TableInfo,
    pks_old: &[*mut value],
) -> Result<ResultCode, String> {
    Ok(ResultCode::OK)
}
