extern crate alloc;
use alloc::format;
use alloc::string::String;
use alloc::vec;
use sqlite::Connection;

use core::{ffi::c_char, str::Utf8Error};

use sqlite::{sqlite3, ResultCode};
use sqlite_nostd as sqlite;

use crate::tableinfo::TableInfo;

pub fn create_triggers(
    db: *mut sqlite3,
    table_info: &TableInfo,
    err: *mut *mut c_char,
) -> Result<ResultCode, ResultCode> {
    create_insert_trigger(db, table_info, err)?;
    create_update_trigger(db, table_info, err)?;
    create_delete_trigger(db, table_info, err)
}

fn create_insert_trigger(
    db: *mut sqlite3,
    table_info: &TableInfo,
    _err: *mut *mut c_char,
) -> Result<ResultCode, ResultCode> {
    let pk_list = crate::util::as_identifier_list(&table_info.pks, None)?;
    let pk_new_list = crate::util::as_identifier_list(&table_info.pks, Some("NEW."))?;
    let pk_where_list = crate::util::pk_where_list(&table_info.pks, Some("NEW."))?;
    let trigger_body = insert_trigger_body(
        table_info,
        &table_info.tbl_name,
        pk_list,
        pk_new_list,
        pk_where_list,
    )?;

    let create_trigger_sql = format!(
        "CREATE TRIGGER IF NOT EXISTS \"{table_name}__crsql_itrig\"
      AFTER INSERT ON \"{table_name}\" WHEN crsql_internal_sync_bit() = 0
      BEGIN
        {trigger_body}
      END;",
        table_name = crate::util::escape_ident(&table_info.tbl_name),
        trigger_body = trigger_body
    );

    db.exec_safe(&create_trigger_sql)
}

fn insert_trigger_body(
    table_info: &TableInfo,
    table_name: &str,
    pk_list: String,
    pk_new_list: String,
    pk_where_list: String,
) -> Result<String, Utf8Error> {
    let mut trigger_components = vec![];

    if table_info.non_pks.len() == 0 {
        // a table that only has primary keys.
        // we'll need to record a create record in this case.
        trigger_components.push(format!(
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
            crsql_next_db_version(),
            crsql_increment_and_get_seq(),
            NULL
          ON CONFLICT DO UPDATE SET
            __crsql_col_version = CASE __crsql_col_version % 2 WHEN 0 THEN __crsql_col_version + 1 ELSE __crsql_col_version + 2 END,
            __crsql_db_version = crsql_next_db_version(),
            __crsql_seq = crsql_get_seq() - 1,
            __crsql_site_id = NULL;",
          table_name = crate::util::escape_ident(table_name),
          pk_list = &pk_list,
          pk_new_list = pk_new_list,
          col_name = crate::c::INSERT_SENTINEL
      ));
    } else {
        // only update the create record if it exists.
        // this is an optimization so as not to create create records
        // for things that don't strictly need them.
        trigger_components.push(format!(
          "UPDATE \"{table_name}__crsql_clock\" SET
            __crsql_col_version = CASE __crsql_col_version % 2 WHEN 0 THEN __crsql_col_version + 1 ELSE __crsql_col_version + 2 END,
            __crsql_db_version = crsql_next_db_version(),
            __crsql_seq = crsql_increment_and_get_seq(),
            __crsql_site_id = NULL
          WHERE {pk_where_list} AND __crsql_col_name = '{col_name}';",
          table_name = crate::util::escape_ident(table_name),
          pk_where_list = pk_where_list,
          col_name = crate::c::INSERT_SENTINEL
        ));
    }

    for col in table_info.non_pks.iter() {
        trigger_components.push(format_insert_trigger_component(
            table_name,
            &pk_list,
            &pk_new_list,
            &col.name,
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
          crsql_next_db_version(),
          crsql_increment_and_get_seq(),
          NULL
        ON CONFLICT DO UPDATE SET
          __crsql_col_version = __crsql_col_version + 1,
          __crsql_db_version = crsql_next_db_version(),
          __crsql_seq = crsql_get_seq() - 1,
          __crsql_site_id = NULL;",
        table_name = crate::util::escape_ident(table_name),
        pk_list = pk_list,
        pk_new_list = pk_new_list,
        col_name = crate::util::escape_ident_as_value(col_name)
    )
}

fn create_update_trigger(
    db: *mut sqlite3,
    table_info: &TableInfo,
    _err: *mut *mut c_char,
) -> Result<ResultCode, ResultCode> {
    let table_name = &table_info.tbl_name;
    let pk_columns = &table_info.pks;
    let non_pk_columns = &table_info.non_pks;
    let pk_new_list = crate::util::as_identifier_list(pk_columns, Some("NEW."))?;
    let pk_old_list = crate::util::as_identifier_list(pk_columns, Some("OLD."))?;

    let trigger_body = if non_pk_columns.is_empty() {
        format!(
            "SELECT crsql_after_update('{table_name}', {pk_new_list}, {pk_old_list})",
            table_name = crate::util::escape_ident_as_value(table_name),
            pk_new_list = pk_new_list,
            pk_old_list = pk_old_list,
        )
    } else {
        format!(
        "SELECT crsql_after_update('{table_name}', {pk_new_list}, {pk_old_list}, {non_pk_new_list}, {non_pk_old_list})",
        table_name = crate::util::escape_ident_as_value(table_name),
        pk_new_list = pk_new_list,
        pk_old_list = pk_old_list,
        non_pk_new_list = crate::util::as_identifier_list(non_pk_columns, Some("NEW."))?,
        non_pk_old_list = crate::util::as_identifier_list(non_pk_columns, Some("OLD."))?
      )
    };
    db.exec_safe(&format!(
        "CREATE TRIGGER IF NOT EXISTS \"{table_name}__crsql_utrig\"
      AFTER UPDATE ON \"{table_name}\" WHEN crsql_internal_sync_bit() = 0
      BEGIN
        {trigger_body};
      END;",
        table_name = crate::util::escape_ident(table_name),
    ))
}

fn create_delete_trigger(
    db: *mut sqlite3,
    table_info: &TableInfo,
    _err: *mut *mut c_char,
) -> Result<ResultCode, ResultCode> {
    let table_name = &table_info.tbl_name;
    let pk_columns = &table_info.pks;
    let pk_list = crate::util::as_identifier_list(pk_columns, None)?;
    let pk_old_list = crate::util::as_identifier_list(pk_columns, Some("OLD."))?;
    let pk_where_list = crate::util::pk_where_list(pk_columns, Some("OLD."))?;

    let create_trigger_sql = format!(
        "CREATE TRIGGER IF NOT EXISTS \"{table_name}__crsql_dtrig\"
    AFTER DELETE ON \"{table_name}\" WHEN crsql_internal_sync_bit() = 0
    BEGIN
      INSERT INTO \"{table_name}__crsql_clock\" (
        {pk_list},
        __crsql_col_name,
        __crsql_col_version,
        __crsql_db_version,
        __crsql_seq,
        __crsql_site_id
      ) SELECT
        {pk_old_list},
        '{sentinel}',
        2,
        crsql_next_db_version(),
        crsql_increment_and_get_seq(),
        NULL WHERE true
      ON CONFLICT DO UPDATE SET
        __crsql_col_version = 1 + __crsql_col_version,
        __crsql_db_version = crsql_next_db_version(),
        __crsql_seq = crsql_get_seq() - 1,
        __crsql_site_id = NULL;
      DELETE FROM \"{table_name}__crsql_clock\"
        WHERE {pk_where_list} AND __crsql_col_name != '{sentinel}';
    END;",
        table_name = crate::util::escape_ident(table_name),
        sentinel = crate::c::DELETE_SENTINEL,
        pk_where_list = pk_where_list,
        pk_old_list = pk_old_list
    );

    db.exec_safe(&create_trigger_sql)
}
