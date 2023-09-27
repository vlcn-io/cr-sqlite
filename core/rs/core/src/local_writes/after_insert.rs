use alloc::string::String;
use core::ffi::c_int;
use sqlite::sqlite3;
use sqlite::value;
use sqlite::ResultCode;
use sqlite_nostd as sqlite;

use crate::db_version;
use crate::{c::crsql_ExtData, tableinfo::TableInfo};

use super::bump_seq;

#[no_mangle]
pub unsafe extern "C" fn crsql_after_insert(
    ctx: *mut sqlite::context,
    argc: c_int,
    argv: *mut *mut sqlite::value,
) {
    // let result = trigger_fn_preamble(ctx, argc, argv, |table_info, values, ext_data| {
    //     after_insert(table_info, values, ext_data)
    // });
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
        // update_create_record_if_exists();
        return Ok(ResultCode::OK);
    }

    // now for each column, create the column record
    for col in tbl_info.non_pks.iter() {
        let seq = bump_seq(ext_data);
        // super::mark_new_column_row_created(db, tbl_info, col, val, db_version, seq)?;
    }
    Ok(ResultCode::OK)
}
