use core::ffi::c_int;
use core::mem::ManuallyDrop;

use alloc::boxed::Box;
use alloc::format;
use alloc::slice;
use alloc::string::String;
use alloc::vec::Vec;
use sqlite::ManagedStmt;
use sqlite::{sqlite3, value, Context, ResultCode, Value};
use sqlite_nostd as sqlite;

use crate::stmt_cache::reset_cached_stmt;
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
    let next_db_version = crate::db_version::next_db_version(db, ext_data, None)?;
    let next_seq = unsafe {
        (*ext_data).seq += 1;
        (*ext_data).seq
    };

    // Changing a primary key column to a new value is the same thing as deleting the row
    // previously identified by the primary key.
    if crate::compare_values::any_value_changed(pks_new, pks_old)? {
        // Record the delete of the row identified by the old primary keys
        after_update__mark_old_pk_row_deleted(db, tbl_info, pks_old, next_db_version, next_seq)?;
        after_update__move_non_sentinels(db, tbl_info, pks_new, pks_old)?;
        // Record a create of the row identified by the new primary keys
        // Technically we don't need to do this given our sentinel optimization?
        // Actually we do because the update could be _only_ a pk change with no
        // corresponding col value changes. Wait.. don't we need to run through
        // and create records for all those then?
        // after_update__mark_new_pk_row_created(db);
    }

    Ok(ResultCode::OK)
}

#[allow(non_snake_case)]
fn after_update__mark_old_pk_row_deleted(
    db: *mut sqlite3,
    tbl_info: &TableInfo,
    pks: &[*mut value],
    db_version: i64,
    seq: i32,
) -> Result<ResultCode, String> {
    let mark_locally_deleted_stmt_ref = tbl_info
        .get_mark_locally_deleted_stmt(db)
        .or_else(|_e| Err("failed to get mark_locally_deleted_stmt"))?;
    let mark_locally_deleted_stmt = mark_locally_deleted_stmt_ref
        .as_ref()
        .ok_or("Failed to deref sentinel stmt")?;
    for (i, pk) in pks.iter().enumerate() {
        mark_locally_deleted_stmt
            .bind_value(i as i32 + 1, *pk)
            .or_else(|_e| Err("failed to bind pks to mark_locally_deleted_stmt"))?;
    }
    mark_locally_deleted_stmt
        .bind_int64(pks.len() as i32 + 1, db_version)
        .and_then(|_| mark_locally_deleted_stmt.bind_int(pks.len() as i32 + 2, seq))
        .and_then(|_| mark_locally_deleted_stmt.bind_int64(pks.len() as i32 + 3, db_version))
        .and_then(|_| mark_locally_deleted_stmt.bind_int(pks.len() as i32 + 4, seq))
        .or_else(|_| Err("failed binding to mark locally deleted stmt"))?;
    step_trigger_stmt(mark_locally_deleted_stmt)
}

// TODO: in the future we can keep sentinel information in the lookaside
#[allow(non_snake_case)]
fn after_update__move_non_sentinels(
    db: *mut sqlite3,
    tbl_info: &TableInfo,
    pks_new: &[*mut value],
    pks_old: &[*mut value],
) -> Result<ResultCode, String> {
    let move_non_sentinels_stmt_ref = tbl_info
        .get_move_non_sentinels_stmt(db)
        .or_else(|_| Err("failed to get move_non_sentinels_stmt"))?;
    let move_non_sentinels_stmt = move_non_sentinels_stmt_ref
        .as_ref()
        .ok_or("Failed to deref move_non_sentinels_stmt")?;

    // set things to new pk values
    for (i, pk) in pks_new.iter().enumerate() {
        move_non_sentinels_stmt
            .bind_value(i as i32 + 1, *pk)
            .or_else(|_| Err("failed to bind pks to move_non_sentinels_stmt"))?;
    }
    // where they have the old pk values
    for (i, pk) in pks_old.iter().enumerate() {
        move_non_sentinels_stmt
            .bind_value((i + 1 + pks_new.len()) as i32, *pk)
            .or_else(|_| Err("failed to bind pks to move_non_sentinels_stmt"))?;
    }
    step_trigger_stmt(move_non_sentinels_stmt)
}

fn step_trigger_stmt(stmt: &ManagedStmt) -> Result<ResultCode, String> {
    match stmt.step() {
        Ok(ResultCode::DONE) => {
            reset_cached_stmt(stmt.stmt)
                .or_else(|_e| Err("unable to reset cached trigger stmt"))?;
            Ok(ResultCode::OK)
        }
        Ok(code) | Err(code) => {
            reset_cached_stmt(stmt.stmt)
                .or_else(|_e| Err("unable to reset cached trigger stmt"))?;
            Err(format!(
                "unexpected result code from tigger_stmt.step: {}",
                code
            ))
        }
    }
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
