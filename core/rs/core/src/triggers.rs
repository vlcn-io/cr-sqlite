extern crate alloc;
use alloc::format;
use alloc::string::String;
use alloc::string::ToString;
use alloc::vec;
use sqlite::Connection;

use core::{
    ffi::{c_char, c_int, CStr},
    slice,
    str::Utf8Error,
};

use crate::c::crsql_TableInfo;
use sqlite::{sqlite3, ResultCode};
use sqlite_nostd as sqlite;

#[no_mangle]
pub extern "C" fn crsql_create_insert_trigger(
    db: *mut sqlite3,
    table_info: *mut crsql_TableInfo,
    err: *mut *mut c_char,
) -> c_int {
    match create_insert_trigger(db, table_info, err) {
        Ok(code) => code as c_int,
        Err(code) => code as c_int,
    }
}

fn create_insert_trigger(
    db: *mut sqlite3,
    table_info: *mut crsql_TableInfo,
    err: *mut *mut c_char,
) -> Result<ResultCode, ResultCode> {
    let table_name = unsafe { CStr::from_ptr((*table_info).tblName).to_str()? };
    let pk_columns =
        unsafe { slice::from_raw_parts((*table_info).pks, (*table_info).pksLen as usize) };
    let pk_list = crate::c::as_identifier_list(pk_columns, None)?;
    let pk_new_list = crate::c::as_identifier_list(pk_columns, Some("NEW."))?;
    let trigger_body = insert_trigger_body(table_info, table_name, pk_list, pk_new_list)?;

    let create_trigger_sql = format!(
        "CREATE TRIGGER IF NOT EXISTS \"{table_name}__crsql_itrig\"
      AFTER INSERT ON \"{table_name}\" WHEN crsql_internal_sync_bit() = 0
      BEGIN
        {trigger_body}
      END;",
        table_name = crate::escape_ident(table_name),
        trigger_body = trigger_body
    );

    db.exec_safe(&create_trigger_sql)
}

fn insert_trigger_body(
    table_info: *mut crsql_TableInfo,
    table_name: &str,
    pk_list: String,
    pk_new_list: String,
) -> Result<String, Utf8Error> {
    let non_pk_columns =
        unsafe { slice::from_raw_parts((*table_info).nonPks, (*table_info).nonPksLen as usize) };
    let mut trigger_components = vec![];
    if non_pk_columns.len() == 0 {
        trigger_components.push(format_insert_trigger_component(
            table_name,
            &pk_list,
            &pk_new_list,
            crate::c::INSERT_SENTINEL,
        ))
    }
    for col in non_pk_columns {
        let col_name = unsafe { CStr::from_ptr(col.name).to_str()? };
        trigger_components.push(format_insert_trigger_component(
            table_name,
            &pk_list,
            &pk_new_list,
            col_name,
        ))
    }

    Ok(trigger_components.join("\n"))
}

fn format_insert_trigger_component(
    table_name: &str,
    pk_list: &str,
    pk_new_list: &str,
    col_name: &str,
) -> String {
    format!(
        "INSERT INTO \"{table_name}__crsql_clock\" (
  {pk_list},
  __crsql_col_name,
  __crsql_col_version,
  __crsql_db_version,
  __crsql_seq,
  __crsql_site_id
) SELECT
  {pk_new_list},
  '{col_name}',
  1,
  crsql_nextdbversion(),
  crsql_increment_and_get_seq(),
  NULL
ON CONFLICT DO UPDATE SET
  __crsql_col_version = __crsql_col_version + 1,
  __crsql_db_version = crsql_nextdbversion(),
  __crsql_seq = crsql_get_seq() - 1,
  __crsql_site_id = NULL;",
        table_name = crate::escape_ident(table_name),
        pk_list = pk_list,
        pk_new_list = pk_new_list,
        col_name = crate::escape_ident_as_value(col_name)
    )
}

#[no_mangle]
pub extern "C" fn crsql_create_update_trigger(
    db: *mut sqlite3,
    table_info: *mut crsql_TableInfo,
    err: *mut *mut c_char,
) -> c_int {
    match create_update_trigger(db, table_info, err) {
        Ok(code) => code as c_int,
        Err(code) => code as c_int,
    }
}

fn create_update_trigger(
    db: *mut sqlite3,
    table_info: *mut crsql_TableInfo,
    err: *mut *mut c_char,
) -> Result<ResultCode, ResultCode> {
    Ok(ResultCode::OK)
}

// TODO: #[test] for insert trigger creation
