use core::ffi::c_int;
use core::mem::ManuallyDrop;

use alloc::boxed::Box;
use alloc::format;
use alloc::slice;
use alloc::string::String;
use alloc::vec;
use alloc::vec::Vec;
use sqlite::{sqlite3, value, Context, ResultCode, Value};
use sqlite_nostd as sqlite;

use crate::c::crsql_getDbVersion;
use crate::{c::crsql_ExtData, tableinfo::TableInfo};

#[no_mangle]
pub unsafe extern "C" fn crsql_after_update(
    ctx: *mut sqlite::context,
    argc: c_int,
    argv: *mut *mut sqlite::value,
) -> c_int {
    if argc < 1 {
        ctx.result_error("expected at least 1 argument");
        return ResultCode::ERROR as c_int;
    }

    let values = sqlite::args!(argc, argv);
    let ext_data = sqlite::user_data(ctx) as *mut crsql_ExtData;
    let table_infos =
        ManuallyDrop::new(Box::from_raw((*ext_data).tableInfos as *mut Vec<TableInfo>));

    let table_name = values[0].text();
    let table_info = match table_infos.iter().find(|t| t.tbl_name == table_name) {
        Some(t) => t,
        None => {
            ctx.result_error(&format!("table {} not found", table_name));
            return ResultCode::ERROR as c_int;
        }
    };

    let (pks_new, pks_old, non_pks_new, non_pks_old) =
        match partition_values(values, 1, table_info.pks.len(), table_info.non_pks.len()) {
            Ok((pks_new, pks_old, non_pks_new, non_pks_old)) => {
                (pks_new, pks_old, non_pks_new, non_pks_old)
            }
            Err(msg) => {
                ctx.result_error(&msg);
                return ResultCode::ERROR as c_int;
            }
        };

    match after_update(
        ctx.db_handle(),
        ext_data,
        table_info,
        pks_new,
        pks_old,
        non_pks_new,
        non_pks_old,
    ) {
        Ok(code) => code as c_int,
        Err(msg) => {
            ctx.result_error(&msg);
            ResultCode::ERROR as c_int
        }
    }
}

fn partition_values<T>(
    values: &[T],
    offset: usize,
    num_pks: usize,
    num_non_pks: usize,
) -> Result<(&[T], &[T], &[T], &[T]), String> {
    let expected_len = offset + num_pks * 2 + num_non_pks * 2;
    if values.len() != expected_len {
        return Err(format!(
            "expected {} values, got {}",
            expected_len,
            values.len()
        ));
    }
    Ok((
        &values[offset..num_pks + offset],
        &values[num_pks + offset..num_pks * 2 + offset],
        &values[num_pks * 2 + offset..num_pks * 2 + num_non_pks + offset],
        &values[num_pks * 2 + num_non_pks + offset..],
    ))
}

fn after_update(
    db: *mut sqlite3,
    ext_data: *mut crsql_ExtData,
    tbl_info: &TableInfo,
    pks_new: &[*mut value],
    pks_old: &[*mut value],
    non_pks_new: &[*mut value],
    non_pks_old: &[*mut value],
) -> Result<ResultCode, String> {
    let seq = increment_and_get_seq();
    let err_msg = crate::util::make_err_ptr();

    // getDbVersion actually fills ext_data with the db version. TODO: rename it!
    let rc = unsafe { crsql_getDbVersion(db, ext_data, err_msg) };
    if rc != ResultCode::OK as c_int {
        return Err(crate::util::get_err_msg(err_msg));
    }
    crate::util::drop_err_ptr(err_msg);

    let current_db_version = unsafe { (*ext_data).dbVersion };
    let seq = unsafe {
        (*ext_data).seq += 1;
        (*ext_data).seq
    };

    // Check if any PK value changed
    // If so,
    // 1. insert or update a sentinel for the old thing
    // 2. delete all the non senintels
    if crate::compare_values::any_value_changed(pks_new, pks_old)? {
        // insert_or_update_sentinel(tbl_info, pks_old)?;
        // delete_non_sentinels();
    }

    Ok(ResultCode::OK)
}

fn insert_or_update_sentinel(db: *mut sqlite3, tbl_info: &TableInfo, pks: &[*mut value]) {
    let insert_or_update_sentinel_stmt_ref = tbl_info.get_insert_or_update_sentinel_stmt(db)?;
    let insert_or_update_sentinel_stmt = insert_or_update_sentinel_stmt_ref
        .as_ref()
        .ok_or(ResultCode::ERROR)?;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_partition_values() {
        let values1 = vec!["tbl", "pk.new", "pk.old", "c.new", "c.old"];
        let values2 = vec!["tbl", "pk.new", "pk.old"];
        let values3 = vec!["tbl", "pk1.new", "pk2.new", "pk1.old", "pk2.old"];
        let values4 = vec![
            "tbl", "pk1.new", "pk2.new", "pk1.old", "pk2.old", "c.new", "d.new", "c.old", "d.old",
        ];

        assert_eq!(
            partition_values(&values1, 1, 1, 1),
            Ok((
                &["pk.new"] as &[&str],
                &["pk.old"] as &[&str],
                &["c.new"] as &[&str],
                &["c.old"] as &[&str]
            ))
        );
        assert_eq!(
            partition_values(&values2, 1, 1, 0),
            Ok((
                &["pk.new"] as &[&str],
                &["pk.old"] as &[&str],
                &[] as &[&str],
                &[] as &[&str]
            ))
        );
        assert_eq!(
            partition_values(&values3, 1, 2, 0),
            Ok((
                &["pk1.new", "pk2.new"] as &[&str],
                &["pk1.old", "pk2.old"] as &[&str],
                &[] as &[&str],
                &[] as &[&str]
            ))
        );
        assert_eq!(
            partition_values(&values4, 1, 2, 2),
            Ok((
                &["pk1.new", "pk2.new"] as &[&str],
                &["pk1.old", "pk2.old"] as &[&str],
                &["c.new", "d.new"] as &[&str],
                &["c.old", "d.old"] as &[&str]
            ))
        );
    }
}
