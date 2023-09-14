use alloc::vec::Vec;
use core::ffi::{c_char, CStr};
use sqlite_nostd as sqlite;
use sqlite_nostd::ResultCode;

use crate::bootstrap::create_clock_table;
use crate::tableinfo::{free_table_info, is_table_compatible, pull_table_info};
use crate::triggers::create_triggers;
use crate::{backfill_table, is_crr, remove_crr_triggers_if_exist};

/**
 * Create a new crr --
 * all triggers, views, tables
 */
pub fn create_crr(
    db: *mut sqlite::sqlite3,
    _schema: &str,
    table: &str,
    is_commit_alter: bool,
    no_tx: bool,
    err: *mut *mut c_char,
) -> Result<ResultCode, ResultCode> {
    if !is_table_compatible(db, table, err)? {
        return Err(ResultCode::ERROR);
    }
    if is_crr(db, table)? {
        return Ok(ResultCode::OK);
    }

    // We do not / can not pull this from the cached set of table infos
    // since nothing would exist in it for a table not yet made into a crr.
    // TODO: Note: we can optimize out our `ensureTableInfosAreUpToDate` by mutating our ext data
    // when upgrading stuff to CRRs
    let table_info = pull_table_info(db, table, err)?;

    create_clock_table(db, &table_info, err)
        .and_then(|_| remove_crr_triggers_if_exist(db, table))
        .and_then(|_| create_triggers(db, &table_info, err))
        .map_err(cleanup)?;

    let (non_pk_cols, pk_cols) = unsafe {
        let info = table_info
            .as_ref()
            .ok_or(ResultCode::ERROR)
            .map_err(cleanup)?;
        let (pks, non_pks) = (info.pksLen as usize, info.nonPksLen as usize);
        // Iterate without ownership transfer
        (
            (0..non_pks)
                .map(|i| &*info.nonPks.offset(i as isize))
                .map(|x| CStr::from_ptr(x.name).to_str())
                .collect::<Result<Vec<_>, _>>()
                .map_err(|_| ResultCode::ERROR)
                .map_err(cleanup)?,
            (0..pks)
                .map(|i| &*info.pks.offset(i as isize))
                .map(|x| CStr::from_ptr(x.name).to_str())
                .collect::<Result<Vec<_>, _>>()
                .map_err(|_| ResultCode::ERROR)
                .map_err(cleanup)?,
        )
    };

    backfill_table(db, table, pk_cols, non_pk_cols, is_commit_alter, no_tx).map_err(cleanup)?;

    Ok(cleanup(ResultCode::OK))
}
