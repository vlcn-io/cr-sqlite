use core::ffi::{c_char, c_int, CStr};

use crate::{c::crsql_TableInfo, consts};
use alloc::format;
use core::slice;
use sqlite::{sqlite3, Connection, Destructor, ResultCode};
use sqlite_nostd as sqlite;

fn uuid() -> [u8; 16] {
    let mut blob: [u8; 16] = [0; 16];
    sqlite::randomness(&mut blob);
    blob[6] = (blob[6] & 0x0f) + 0x40;
    blob[8] = (blob[8] & 0x3f) + 0x80;
    blob
}

#[no_mangle]
pub extern "C" fn crsql_init_site_id(db: *mut sqlite3, ret: *mut u8) -> c_int {
    let buffer: &mut [u8] = unsafe { slice::from_raw_parts_mut(ret, 16) };
    if let Ok(site_id) = init_site_id(db) {
        buffer.copy_from_slice(&site_id);
        ResultCode::OK as c_int
    } else {
        ResultCode::ERROR as c_int
    }
}

fn create_site_id_and_site_id_table(db: *mut sqlite3) -> Result<[u8; 16], ResultCode> {
    db.exec_safe(&format!(
        "CREATE TABLE \"{tbl}\" (site_id)",
        tbl = consts::TBL_SITE_ID
    ))?;

    let stmt = db.prepare_v2(&format!(
        "INSERT INTO \"{tbl}\" (site_id) VALUES (?)",
        tbl = consts::TBL_SITE_ID
    ))?;

    let site_id = uuid();
    stmt.bind_blob(1, &site_id, Destructor::STATIC)?;
    stmt.step()?;

    Ok(site_id)
}

#[no_mangle]
pub extern "C" fn crsql_init_peer_tracking_table(db: *mut sqlite3) -> c_int {
    match db.exec_safe("CREATE TABLE IF NOT EXISTS crsql_tracked_peers (\"site_id\" BLOB NOT NULL, \"version\" INTEGER NOT NULL, \"seq\" INTEGER DEFAULT 0, \"tag\" INTEGER, \"event\" INTEGER, PRIMARY KEY (\"site_id\", \"tag\", \"event\")) STRICT;") {
      Ok(_) => ResultCode::OK as c_int,
      Err(code) => code as c_int
    }
}

/**
 * Loads the siteId into memory. If a site id
 * cannot be found for the given database one is created
 * and saved to the site id table.
 */
fn init_site_id(db: *mut sqlite3) -> Result<[u8; 16], ResultCode> {
    let stmt =
        db.prepare_v2("SELECT 1 FROM sqlite_master WHERE type = 'table' AND tbl_name = ?")?;
    stmt.bind_text(1, consts::TBL_SITE_ID, Destructor::STATIC)?;
    let tbl_exists_result = stmt.step()?;
    if tbl_exists_result != ResultCode::ROW {
        return create_site_id_and_site_id_table(db);
    }

    let stmt = db.prepare_v2(&format!("SELECT site_id FROM \"{}\"", consts::TBL_SITE_ID))?;
    let result_code = stmt.step()?;

    if result_code == ResultCode::DONE {
        return Err(ResultCode::ERROR);
    }

    let site_id_from_table = stmt.column_blob(0)?;
    let ret: [u8; 16] = site_id_from_table.try_into()?;

    Ok(ret)
}

#[no_mangle]
pub extern "C" fn crsql_create_schema_table_if_not_exists(db: *mut sqlite3) -> c_int {
    let r = db.exec_safe("SAVEPOINT crsql_create_schema_table;");
    if let Err(code) = r {
        return code as c_int;
    }

    if let Ok(_) = db.exec_safe(&format!(
        "CREATE TABLE IF NOT EXISTS \"{}\" (\"key\" TEXT PRIMARY KEY, \"value\" ANY);",
        consts::TBL_SCHEMA
    )) {
        let result = db.exec_safe("RELEASE crsql_create_schema_table;");
        match result {
            Ok(_) => return ResultCode::OK as c_int,
            Err(code) => return code as c_int,
        }
    } else {
        let _ = db.exec_safe("ROLLBACK");
        return ResultCode::ERROR as c_int;
    }
}

fn update_to_0_13_0(db: *mut sqlite3) -> Result<ResultCode, ResultCode> {
    // get all clock tables
    // alter all to add column
    // __crsql_clock
    let stmt = db.prepare_v2(consts::CLOCK_TABLES_SELECT)?;

    while stmt.step()? == ResultCode::ROW {
        let tbl_name = stmt.column_text(0)?;
        db.exec_safe(&format!(
            "ALTER TABLE \"{}\" ADD COLUMN \"__crsql_seq\" NOT NULL DEFAULT 0",
            crate::util::escape_ident(tbl_name)
        ))?;
    }

    Ok(ResultCode::OK)
}

#[no_mangle]
pub extern "C" fn crsql_maybe_update_db(db: *mut sqlite3) -> c_int {
    let r = db.exec_safe("SAVEPOINT crsql_maybe_update_db;");
    if let Err(code) = r {
        return code as c_int;
    }
    if let Ok(_) = maybe_update_db_inner(db) {
        let _ = db.exec_safe("RELEASE crsql_maybe_update_db;");
        return ResultCode::OK as c_int;
    } else {
        let _ = db.exec_safe("ROLLBACK;");
        return ResultCode::ERROR as c_int;
    }
}

fn maybe_update_db_inner(db: *mut sqlite3) -> Result<ResultCode, ResultCode> {
    let stmt = db.prepare_v2("SELECT value FROM crsql_master WHERE key = 'crsqlite_version'")?;

    let step_result = stmt.step()?;
    let mut recorded_version: i32 = 0;
    // read the schema version for master
    // if none, v0.12.0 or earlier
    // if matches current version, we're good.
    if step_result == ResultCode::ROW {
        recorded_version = stmt.column_int(0)?;
    } else if step_result == ResultCode::DONE {
        update_to_0_13_0(db)?;
    }

    if recorded_version < consts::CRSQLITE_VERSION {
        let stmt =
            db.prepare_v2("INSERT OR REPLACE INTO crsql_master VALUES ('crsqlite_version', ?)")?;
        stmt.bind_int(1, consts::CRSQLITE_VERSION)?;
        stmt.step()?;
    }

    Ok(ResultCode::OK)
}

/**
 * The clock table holds the versions for each column of a given row.
 *
 * These version are set to the dbversion at the time of the write to the
 * column.
 *
 * The dbversion is updated on transaction commit.
 * This allows us to find all columns written in the same transaction
 * albeit with caveats.
 *
 * The caveats being that two partiall overlapping transactions will
 * clobber the full transaction picture given we only keep latest
 * state and not a full causal history.
 *
 * @param tableInfo
 */
#[no_mangle]
pub extern "C" fn crsql_create_clock_table(
    db: *mut sqlite3,
    table_info: *mut crsql_TableInfo,
    err: *mut *mut c_char,
) -> c_int {
    match create_clock_table(db, table_info, err) {
        Ok(_) => ResultCode::OK as c_int,
        Err(code) => code as c_int,
    }
}

fn create_clock_table(
    db: *mut sqlite3,
    table_info: *mut crsql_TableInfo,
    _err: *mut *mut c_char,
) -> Result<ResultCode, ResultCode> {
    let columns = sqlite::args!((*table_info).pksLen, (*table_info).pks);
    let pk_list = crate::c::as_identifier_list(columns, None)?;
    let table_name = unsafe { CStr::from_ptr((*table_info).tblName).to_str() }?;

    db.exec_safe(&format!(
        "CREATE TABLE IF NOT EXISTS \"{table_name}__crsql_clock\" (
      {pk_list},
      __crsql_col_name NOT NULL,
      __crsql_col_version NOT NULL,
      __crsql_db_version NOT NULL,
      __crsql_site_id,
      __crsql_seq NOT NULL,
      PRIMARY KEY ({pk_list}, __crsql_col_name)
    )",
        pk_list = pk_list,
        table_name = crate::util::escape_ident(table_name)
    ))?;

    db.exec_safe(
      &format!(
        "CREATE INDEX IF NOT EXISTS \"{table_name}__crsql_clock_dbv_idx\" ON \"{table_name}__crsql_clock\" (\"__crsql_db_version\")",
        table_name = crate::util::escape_ident(table_name),
      ))
}
